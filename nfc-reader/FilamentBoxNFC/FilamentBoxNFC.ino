/*
 * FilamentBox NFC Reader v1.1 — D1 Mini + PN532 (SPI)
 * ═══════════════════════════════════════════════════
 * v1.1 — indirizzo del server in una sola costante (FILAMENTBOX_URL),
 *        versione stampata all'avvio; logica invariata rispetto alla v1.0
 * v1.0 — lettura OpenTag3D e tag Bambu Lab, heartbeat, coda di scrittura,
 *        pulsante per lo slot AMS, WiFi 802.11g per reti mesh
 * Legge tag NTAG213/215/216 con record NDEF OpenTag3D.
 * Quando rileva un tag, legge l'UID e il payload NDEF,
 * poi chiama il webhook di FilamentBox via HTTP POST.
 *
 * Librerie richieste:
 *   - ELECHOUSE PN532 (installazione manuale da GitHub, non su Library Manager)
 *   - ArduinoJson 6.x (Library Manager: "ArduinoJson" by bblanchon)
 *   - Crypto (Library Manager: "Crypto" by Rhys Weatherley — per HKDF-SHA256,
 *     necessaria per decodificare i tag Bambu Lab originali)
 *
 * Collegamento PN532 → D1 Mini (SPI, DIP: SW1=OFF SW2=ON):
 *   VCC  → 3V3
 *   GND  → GND
 *   SCK  → D5 (GPIO14)
 *   MISO → D6 (GPIO12)
 *   MOSI → D7 (GPIO13)
 *   SS   → D2 (GPIO4)   ← NON usare D8/GPIO15: pin di boot-strapping,
 *                          causa crash-loop se non è LOW all'accensione.
 *
 * Pulsante selezione slot AMS (opzionale ma consigliato):
 *   Un lato del pulsante → D1 (GPIO5)
 *   Altro lato → GND
 *   (usa pull-up interno, non serve resistenza esterna)
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <SPI.h>
#include <PN532_SPI.h>
#include <PN532.h>
#include <ArduinoJson.h>
#include <Crypto.h>
#include <SHA256.h>

// Struct dati Bambu Lab — definita qui in cima perché il precompilatore
// Arduino genera automaticamente i prototipi delle funzioni e li inserisce
// prima di questo punto: se la struct fosse più in basso nel file, i
// prototipi auto-generati non la troverebbero e la compilazione fallirebbe.
struct BambuTagData {
  bool valid = false;
  String materialId;      // es. "GFA50"
  String filamentType;    // es. "PLA"
  String detailedType;    // es. "PLA Basic"
  uint8_t colorR, colorG, colorB;
  uint16_t weightGrams;
  uint16_t bedTempC;
  uint16_t nozzleTempMaxC;
  uint16_t nozzleTempMinC;
};

// ══════════════════════════════════════════════════════════
// CONFIGURA QUI — le uniche cose da cambiare
// ══════════════════════════════════════════════════════════
const char* WIFI_SSID     = "NOME_RETE_WIFI";
const char* WIFI_PASSWORD = "PASSWORD_WIFI";

// Indirizzo del server FilamentBox sulla rete di casa (IP del server e porta, senza "/" finale)
const String FILAMENTBOX_URL = "http://192.168.1.50:3025";

// Token del webhook (copialo da Settings → Home Assistant Webhook → Webhook URL, dopo ?token=)
const String WEBHOOK_TOKEN = "INCOLLA_QUI_IL_TOKEN";
// ══════════════════════════════════════════════════════════

// Pin SPI per PN532 su D1 Mini
// NOTA: D8 (GPIO15) NON va usato per SS — è un pin di strapping boot
// dell'ESP8266 e deve restare LOW all'accensione, altrimenti il chip
// entra in modalità di boot errata e si blocca ("waiting for host").
// D2 (GPIO4) è sicuro, nessun vincolo di boot.
#define PN532_SS_PIN D2  // GPIO4

#define FIRMWARE_VERSION "1.1"
const String WEBHOOK_URL = FILAMENTBOX_URL + "/api/webhook/nfc-scan";

PN532_SPI   pn532spi(SPI, PN532_SS_PIN);
PN532       nfc(pn532spi);

// LED integrato D1 Mini (GPIO2, attivo LOW)
#define LED_PIN LED_BUILTIN

// Pulsante fisico per selezionare lo slot AMS dopo una scansione.
// D1 (GPIO5) è libero, nessun vincolo di boot, supporta pull-up interno.
// Collegamento: un lato del pulsante a D1, l'altro a GND.
#define BUTTON_PIN D1
const unsigned long SLOT_SELECT_WINDOW_MS = 4000; // secondi per premere il pulsante dopo lo scan
const unsigned long BUTTON_DEBOUNCE_MS = 150;

// Ultimo UID letto — per evitare letture continue dello stesso tag
String lastUID = "";
unsigned long lastReadTime = 0;
const unsigned long READ_COOLDOWN_MS = 3000; // ignora stesso tag per 3 secondi

// Heartbeat periodico — segnala a FilamentBox che il lettore è vivo,
// senza bisogno di collegare un cavo USB per verificarlo.
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000; // ogni 30 secondi

// Coda di scrittura tag — controllo periodico se c'è un lavoro in attesa
unsigned long lastWriteJobCheck = 0;
const unsigned long WRITE_JOB_CHECK_INTERVAL_MS = 3000; // ogni 3 secondi
String pendingWritePayloadHex = ""; // vuoto = nessun lavoro in coda
String pendingWriteSpoolId = "";

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n\n=== FilamentBox NFC Reader v" FIRMWARE_VERSION " ===");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH); // spento (attivo LOW)
  pinMode(BUTTON_PIN, INPUT_PULLUP); // premuto = LOW

  // Inizializza PN532
  nfc.begin();
  uint32_t versiondata = nfc.getFirmwareVersion();
  if (!versiondata) {
    Serial.println("ERRORE: PN532 non trovato — verifica cavi e DIP switch (SPI: SW1=OFF SW2=ON)");
    blinkError();
    while (1) { delay(100); yield(); }
  }
  Serial.print("PN532 trovato. Firmware v");
  Serial.print((versiondata >> 16) & 0xFF, DEC);
  Serial.print('.');
  Serial.println((versiondata >> 8) & 0xFF, DEC);

  nfc.SAMConfig();
  nfc.setPassiveActivationRetries(0x01); // non bloccarsi, loop veloce

  // Connessione WiFi
  Serial.print("Connessione WiFi a ");
  Serial.print(WIFI_SSID);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setPhyMode(WIFI_PHY_MODE_11G);  // forza 802.11g: evita i drop con le mesh (Deco)
  WiFi.setSleepMode(WIFI_NONE_SLEEP);  // niente power-save: evita i drop
  WiFi.setAutoReconnect(true);
  // DIAGNOSTICA: scansiona le reti e mostra se la rete configurata è visibile
  int n = WiFi.scanNetworks();
  Serial.printf("\nReti trovate: %d\n", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  %s  ch%d  %d dBm  enc=%d  bssid=%s\n", WiFi.SSID(i).c_str(),
      WiFi.channel(i), WiFi.RSSI(i), WiFi.encryptionType(i), WiFi.BSSIDstr(i).c_str());
  }
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.printf("[%d]", WiFi.status());  // 1=SSID non visto, 4=connect fallita, 6=password errata
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnesso! IP: " + WiFi.localIP().toString());
    blinkOK();
  } else {
    Serial.println("\nERRORE WiFi — riprovo ad ogni lettura tag");
  }

  Serial.println("Pronto. Avvicina un tag NTAG all'antenna...");
}

void loop() {
  yield(); // fondamentale su ESP8266 per evitare WDT reset

  // Ricollega WiFi se perso
  if (WiFi.status() != WL_CONNECTED) {
    static unsigned long lastWifiTry = 0;
    if (millis() - lastWifiTry > 15000) {
      lastWifiTry = millis();
      Serial.println("WiFi perso — riprovo");
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    }
    delay(100);
    return;
  }

  // Invia un segnale di vita periodico, indipendentemente dalla lettura
  // tag — così da FilamentBox si vede se il lettore è ancora collegato
  // e funzionante, senza dover staccare nulla fisicamente per controllare.
  if (millis() - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
    lastHeartbeat = millis();
  }

  // Controlla se c'è un lavoro di scrittura tag in coda da FilamentBox
  if (millis() - lastWriteJobCheck >= WRITE_JOB_CHECK_INTERVAL_MS) {
    checkPendingWriteJob();
    lastWriteJobCheck = millis();
  }

  // Leggi tag in modalità non-bloccante (timeout breve)
  uint8_t uid[7] = {0};
  uint8_t uidLength = 0;
  bool tagFound = nfc.readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 200);

  if (!tagFound) return;

  // Se c'è un lavoro di scrittura in coda, scrivi il tag invece di leggerlo
  if (pendingWritePayloadHex.length() > 0) {
    handleTagWrite(uid, uidLength);
    return;
  }

  // Costruisci stringa UID hex
  String uidHex = "";
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) uidHex += "0";
    uidHex += String(uid[i], HEX);
  }
  uidHex.toUpperCase();

  // Cooldown: ignora stesso tag per READ_COOLDOWN_MS millisecondi
  unsigned long now = millis();
  if (uidHex == lastUID && (now - lastReadTime) < READ_COOLDOWN_MS) return;

  lastUID = uidHex;
  lastReadTime = now;

  Serial.println("Tag rilevato! UID: " + uidHex);
  digitalWrite(LED_PIN, LOW); // accendi LED

  // Prova prima a decodificare come tag Bambu Lab nativo (Mifare Classic 1K).
  // Se fallisce (non è un tag Bambu, es. NTAG213/215 scritto da noi), passa
  // al parsing NDEF/OpenTag3D standard.
  BambuTagData bambu = readBambuTag(uid, uidLength);
  String spoolId = "";

  if (bambu.valid) {
    Serial.println("Tag Bambu Lab riconosciuto: " + bambu.detailedType);
    spoolId = sendBambuToFilamentBox(uidHex, bambu);
  } else {
    String ndefPayload = "";
    String mimeType = "";
    readNDEF(uid, uidLength, ndefPayload, mimeType);
    spoolId = sendToFilamentBox(uidHex, mimeType, ndefPayload);
  }

  delay(100);
  digitalWrite(LED_PIN, HIGH); // spegni LED

  // Se abbiamo riconosciuto una bobina, apri la finestra di selezione slot:
  // premi il pulsante N volte entro pochi secondi per assegnarla allo slot N.
  if (spoolId.length() > 0) {
    waitForSlotSelection(spoolId);
  }
}

// ── Finestra di selezione slot AMS tramite pulsante ──────
// Dopo una scansione riuscita, resta in attesa per SLOT_SELECT_WINDOW_MS
// millisecondi contando le pressioni del pulsante (con debounce). Al termine,
// se sono state contate 1-4 pressioni, assegna la bobina allo slot corrispondente.
void waitForSlotSelection(const String& spoolId) {
  Serial.println("Premi il pulsante 1-4 volte per assegnare lo slot AMS (4s)...");

  int pressCount = 0;
  bool lastButtonState = HIGH; // non premuto (pull-up)
  unsigned long lastDebounceTime = 0;
  unsigned long windowStart = millis();

  while (millis() - windowStart < SLOT_SELECT_WINDOW_MS) {
    yield();
    bool reading = digitalRead(BUTTON_PIN);

    if (reading != lastButtonState) {
      lastDebounceTime = millis();
    }

    if ((millis() - lastDebounceTime) > BUTTON_DEBOUNCE_MS) {
      if (reading == LOW && lastButtonState == HIGH) {
        // Fronte di discesa stabile = pressione valida
        pressCount++;
        Serial.println("Pressione rilevata: " + String(pressCount));
        digitalWrite(LED_PIN, LOW); delay(80); digitalWrite(LED_PIN, HIGH);
        windowStart = millis(); // ogni pressione estende la finestra
      }
    }
    lastButtonState = reading;
  }

  if (pressCount >= 1) {
    int slot = min(pressCount, 4); // clamp a 4 slot massimi
    Serial.println("Slot selezionato: " + String(slot));
    assignSlot(spoolId, slot);
  } else {
    Serial.println("Nessuna pressione — bobina non assegnata a nessuno slot.");
  }
}

// ── Lettura NDEF da NTAG213/215/216 ─────────────────────
// Legge le pagine utente (da pagina 4) e cerca un record NDEF.
// Non usa la libreria NDEF di Don's per semplicità — parsing manuale
// sufficiente per estrarre tipo MIME e payload OpenTag3D.
void readNDEF(uint8_t* uid, uint8_t uidLength, String& payload, String& mimeType) {
  // Su NTAG213 la capacità è 137 byte utente (pagine 4-39)
  // Leggiamo le prime 16 pagine (64 byte) — sufficienti per l'header NDEF
  uint8_t page[4];
  uint8_t allBytes[64] = {0};
  int bytesRead = 0;

  for (uint8_t p = 4; p < 20 && bytesRead < 64; p++) {
    if (!nfc.mifareultralight_ReadPage(p, page)) break;
    for (int i = 0; i < 4 && bytesRead < 64; i++) {
      allBytes[bytesRead++] = page[i];
    }
  }

  // Cerca il TLV NDEF (tipo 0x03)
  int idx = 0;
  while (idx < bytesRead - 2) {
    uint8_t type = allBytes[idx++];
    if (type == 0xFE) break; // Terminator TLV
    if (type == 0x00) continue; // NULL TLV

    uint8_t length = allBytes[idx++];
    if (type == 0x03) {
      // Trovato blocco NDEF — ora parse dell'header NDEF record
      // Formato: [flags][type_len][payload_len][type...][payload...]
      if (idx + 3 >= bytesRead) break;

      uint8_t flags    = allBytes[idx++];
      uint8_t typeLen  = allBytes[idx++];
      uint8_t payLen   = allBytes[idx++];
      // (ignoriamo ID se IL flag è settato per semplicità)

      // Tipo MIME
      String mime = "";
      for (int i = 0; i < typeLen && idx < bytesRead; i++) {
        mime += (char)allBytes[idx++];
      }
      mimeType = mime;

      // Payload
      String pay = "";
      for (int i = 0; i < payLen && idx < bytesRead; i++) {
        pay += (char)allBytes[idx++];
      }
      payload = pay;

      Serial.println("NDEF MIME: " + mimeType);
      Serial.println("Payload len: " + String(payLen) + " byte");
      break;
    } else {
      idx += length; // salta altri TLV
    }
  }
}

// ── Invio dati Bambu Lab nativi al webhook ───────────────
String sendBambuToFilamentBox(const String& uid, const BambuTagData& bambu) {
  WiFiClient client;
  HTTPClient http;

  String url = WEBHOOK_URL + "?token=" + WEBHOOK_TOKEN;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  char colorHex[8];
  snprintf(colorHex, sizeof(colorHex), "#%02X%02X%02X", bambu.colorR, bambu.colorG, bambu.colorB);

  StaticJsonDocument<512> doc;
  doc["uid"] = uid;
  doc["format"] = "bambu_native";
  doc["brand"] = "Bambu Lab";
  doc["material"] = bambu.filamentType;
  doc["detailed_type"] = bambu.detailedType;
  doc["material_id"] = bambu.materialId;
  doc["color_hex"] = String(colorHex);
  doc["weight"] = bambu.weightGrams;
  doc["bed_temp"] = bambu.bedTempC;
  doc["print_temp"] = bambu.nozzleTempMaxC;
  doc["print_temp_min"] = bambu.nozzleTempMinC;

  String body;
  serializeJson(doc, body);

  Serial.println("POST (Bambu) → " + url);
  Serial.println("Body: " + body);

  String spoolId = "";
  int httpCode = http.POST(body);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.println("Risposta HTTP " + String(httpCode) + ": " + response);
    if (httpCode == 200) {
      blinkOK();
      spoolId = extractSpoolId(response);
    } else {
      blinkError();
    }
  } else {
    Serial.println("ERRORE HTTP: " + http.errorToString(httpCode));
    blinkError();
  }
  http.end();
  return spoolId;
}

// ── Invio webhook FilamentBox ────────────────────────────
String sendToFilamentBox(const String& uid, const String& mimeType, const String& ndefPayload) {
  WiFiClient client;
  HTTPClient http;

  String url = WEBHOOK_URL + "?token=" + WEBHOOK_TOKEN;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  // Costruisci il JSON da mandare
  StaticJsonDocument<512> doc;
  doc["uid"] = uid;
  doc["mime_type"] = mimeType;

  // Se è un tag OpenTag3D, decodifica i campi principali dal payload binario
  if (mimeType == "application/opentag3d" && ndefPayload.length() >= 0x62) {
    const char* p = ndefPayload.c_str();
    // Offset dalla spec OpenTag3D Core v1.0 (stesso di OpenTag3DEncoder.swift)
    char material[6] = {0}; strncpy(material, p + 0x02, 5);
    char brand[17]   = {0}; strncpy(brand,    p + 0x1B, 16);
    char colorName[33]={0}; strncpy(colorName, p + 0x2B, 32);
    uint8_t r = (uint8_t)p[0x4B], g = (uint8_t)p[0x4C], b = (uint8_t)p[0x4D];
    int weight = ((uint8_t)p[0x5E] << 8) | (uint8_t)p[0x5F];
    int printTemp = (uint8_t)p[0x60] * 5;
    int bedTemp   = (uint8_t)p[0x61] * 5;

    char colorHex[8];
    snprintf(colorHex, sizeof(colorHex), "#%02X%02X%02X", r, g, b);

    doc["format"]     = "opentag3d";
    doc["material"]   = String(material);
    doc["brand"]      = String(brand);
    doc["color_name"] = String(colorName);
    doc["color_hex"]  = String(colorHex);
    doc["weight"]     = weight;
    doc["print_temp"] = printTemp;
    doc["bed_temp"]   = bedTemp;
  } else {
    doc["format"] = mimeType.length() > 0 ? "ndef_other" : "uid_only";
  }

  String body;
  serializeJson(doc, body);

  Serial.println("POST → " + url);
  Serial.println("Body: " + body);

  String spoolId = "";
  int httpCode = http.POST(body);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.println("Risposta HTTP " + String(httpCode) + ": " + response);
    if (httpCode == 200) {
      blinkOK();
      spoolId = extractSpoolId(response);
    } else {
      blinkError();
    }
  } else {
    Serial.println("ERRORE HTTP: " + http.errorToString(httpCode));
    blinkError();
  }
  http.end();
  return spoolId;
}

// ── Estrae spoolId da una risposta JSON del webhook ──────
// ── Heartbeat: segnala che il lettore è vivo e funzionante ──
// Verifica anche che il PN532 risponda ancora (rileva un problema di
// cablaggio SPI, non solo la connessione WiFi).
// ── Coda di scrittura tag: controllo periodico ───────────
void checkPendingWriteJob() {
  WiFiClient client;
  HTTPClient http;
  String url = FILAMENTBOX_URL + "/api/nfc-write-job?token=" + WEBHOOK_TOKEN;
  http.begin(client, url);
  http.setTimeout(4000);

  int httpCode = http.GET();
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<1024> doc;
    if (!deserializeJson(doc, response)) {
      bool pending = doc["pending"] | false;
      if (pending) {
        String newPayload = doc["payloadHex"].as<String>();
        if (newPayload != pendingWritePayloadHex) {
          pendingWritePayloadHex = newPayload;
          pendingWriteSpoolId = doc["spoolId"].as<String>();
          Serial.println("Lavoro di scrittura tag ricevuto — avvicina un tag vuoto.");
        }
      } else {
        if (pendingWritePayloadHex.length() > 0) {
          Serial.println("Lavoro di scrittura scaduto o completato altrove.");
        }
        pendingWritePayloadHex = "";
        pendingWriteSpoolId = "";
      }
    }
  }
  http.end();
}

// ── Scrittura di un tag OpenTag3D sul tag rilevato ───────
// Costruisce lo stesso wrapping NDEF (TLV 0x03 + record MIME) che
// readNDEF() sa già interpretare, per coerenza di lettura/scrittura.
void handleTagWrite(uint8_t* uid, uint8_t uidLength) {
  Serial.println("Scrittura tag in corso...");
  digitalWrite(LED_PIN, LOW);

  // Decodifica payloadHex (112 byte = 224 caratteri hex) in byte grezzi
  int payloadLen = pendingWritePayloadHex.length() / 2;
  uint8_t payload[128];
  if (payloadLen > 128) payloadLen = 128;
  for (int i = 0; i < payloadLen; i++) {
    payload[i] = strtoul(pendingWritePayloadHex.substring(i*2, i*2+2).c_str(), NULL, 16);
  }

  const char* mimeType = "application/opentag3d";
  uint8_t typeLen = strlen(mimeType);

  // Header NDEF record (short record, singolo record, tipo Media/MIME):
  // MB=1 ME=1 CF=0 SR=1 IL=0 TNF=0x02 → 0xD2
  uint8_t ndefHeader[3] = { 0xD2, typeLen, (uint8_t)payloadLen };
  int ndefRecordLen = 3 + typeLen + payloadLen;

  // TLV wrapper: tag 0x03, length (1 byte se <255), poi il record, poi terminatore 0xFE
  uint8_t buf[160] = {0};
  int idx = 0;
  buf[idx++] = 0x03;
  buf[idx++] = (uint8_t)ndefRecordLen;
  memcpy(buf+idx, ndefHeader, 3); idx += 3;
  memcpy(buf+idx, mimeType, typeLen); idx += typeLen;
  memcpy(buf+idx, payload, payloadLen); idx += payloadLen;
  buf[idx++] = 0xFE; // Terminator TLV

  int totalBytes = idx;
  int totalPages = (totalBytes + 3) / 4; // arrotonda per eccesso a multipli di 4

  if (totalPages > 36) {
    // Non entra nemmeno in un NTAG213 (144 byte utente, 36 pagine) — errore
    Serial.println("ERRORE: dati troppo grandi per il tag (servono " + String(totalBytes) + " byte)");
    reportWriteResult(false, "");
    blinkError();
    digitalWrite(LED_PIN, HIGH);
    return;
  }

  bool writeOk = true;
  for (int page = 0; page < totalPages; page++) {
    uint8_t pageData[4] = {0,0,0,0};
    for (int b = 0; b < 4; b++) {
      int srcIdx = page*4 + b;
      if (srcIdx < totalBytes) pageData[b] = buf[srcIdx];
    }
    if (!nfc.mifareultralight_WritePage(4 + page, pageData)) {
      writeOk = false;
      break;
    }
  }

  String uidHex = "";
  for (uint8_t i = 0; i < uidLength; i++) {
    if (uid[i] < 0x10) uidHex += "0";
    uidHex += String(uid[i], HEX);
  }
  uidHex.toUpperCase();

  if (writeOk) {
    Serial.println("Tag scritto con successo! (" + String(totalPages) + " pagine)");
    blinkOK();
  } else {
    Serial.println("ERRORE durante la scrittura del tag.");
    blinkError();
  }

  reportWriteResult(writeOk, uidHex);
  pendingWritePayloadHex = "";
  pendingWriteSpoolId = "";
  digitalWrite(LED_PIN, HIGH);
}

void reportWriteResult(bool success, const String& uidHex) {
  WiFiClient client;
  HTTPClient http;
  String url = FILAMENTBOX_URL + "/api/nfc-write-job/complete?token=" + WEBHOOK_TOKEN;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<128> doc;
  doc["success"] = success;
  doc["uid"] = uidHex;
  String body;
  serializeJson(doc, body);

  http.POST(body);
  http.end();
}

// ── Heartbeat: segnala che il lettore è vivo e funzionante ──
// Verifica anche che il PN532 risponda ancora (rileva un problema di
// cablaggio SPI, non solo la connessione WiFi).
void sendHeartbeat() {
  uint32_t pn532Version = nfc.getFirmwareVersion();
  bool pn532Ok = (pn532Version != 0);

  WiFiClient client;
  HTTPClient http;
  String url = FILAMENTBOX_URL + "/api/webhook/reader-heartbeat?token=" + WEBHOOK_TOKEN;
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<256> doc;
  doc["pn532_ok"] = pn532Ok;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime_sec"] = millis() / 1000;

  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  Serial.println("Heartbeat → " + String(httpCode) + (pn532Ok ? " (PN532 OK)" : " (PN532 NON RISPONDE!)"));
  http.end();

  // Se il PN532 non risponde più, segnala con un pattern LED distinto
  // (utile anche senza guardare il Serial Monitor, se qualcuno passa vicino).
  if (!pn532Ok) {
    for (int i = 0; i < 2; i++) {
      digitalWrite(LED_PIN, LOW);  delay(300);
      digitalWrite(LED_PIN, HIGH); delay(300);
    }
  }
}

// ── Estrae spoolId da una risposta JSON del webhook ──────
String extractSpoolId(const String& jsonResponse) {
  StaticJsonDocument<512> resp;
  DeserializationError err = deserializeJson(resp, jsonResponse);
  if (err) return "";
  if (resp["spoolId"].is<const char*>()) {
    return String(resp["spoolId"].as<const char*>());
  }
  return "";
}

// ── Assegna una bobina a uno slot AMS (chiamata dopo pressione pulsante) ──
void assignSlot(const String& spoolId, int slotNum) {
  if (spoolId.length() == 0) {
    Serial.println("Nessuno spoolId disponibile, impossibile assegnare slot.");
    return;
  }
  WiFiClient client;
  HTTPClient http;
  String url = FILAMENTBOX_URL + "/api/spools/" + spoolId + "/assign-slot";
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  StaticJsonDocument<128> doc;
  doc["amsSlot"] = slotNum;
  doc["printerSlot"] = "p1s";
  String body;
  serializeJson(doc, body);

  Serial.println("PUT (assign-slot " + String(slotNum) + ") → " + url);

  // Nota: usiamo PUT tramite sendRequest, dato che HTTPClient non ha
  // un metodo PUT() diretto con body su ESP8266HTTPClient.
  int httpCode = http.sendRequest("PUT", body);
  if (httpCode > 0) {
    Serial.println("Risposta assign-slot HTTP " + String(httpCode));
    if (httpCode == 200) blinkOK(); else blinkError();
  } else {
    Serial.println("ERRORE assign-slot: " + http.errorToString(httpCode));
    blinkError();
  }
  http.end();
}

// ── Feedback LED ─────────────────────────────────────────
void blinkOK() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW);  delay(100);
    digitalWrite(LED_PIN, HIGH); delay(100);
  }
}

void blinkError() {
  for (int i = 0; i < 6; i++) {
    digitalWrite(LED_PIN, LOW);  delay(50);
    digitalWrite(LED_PIN, HIGH); delay(50);
  }
}

// ══════════════════════════════════════════════════════════
// Bambu Lab RFID (Mifare Classic 1K) — decodifica nativa
// ══════════════════════════════════════════════════════════
// Dal novembre 2024 le chiavi settoriali si derivano dal solo UID
// del tag tramite HKDF-SHA256, senza bisogno di sniffing (Proxmark3).
// Fonte: https://github.com/Bambu-Research-Group/RFID-Tag-Guide
//
// Algoritmo: HKDF-Extract con salt=master_secret, IKM=UID del tag,
// poi HKDF-Expand con info="RFID-A\0" (o "RFID-B\0") per ottenere
// 16 chiavi settoriali da 6 byte ciascuna (una per settore Mifare).

const uint8_t BAMBU_MASTER_SECRET[16] = {
  0x9a, 0x75, 0x9c, 0xf2, 0xc4, 0xf7, 0xca, 0xff,
  0x22, 0x2c, 0xb9, 0x76, 0x9b, 0x41, 0xbc, 0x96
};

// Calcola HMAC-SHA256(key, data) -> out[32]
void hmacSha256(const uint8_t* key, size_t keyLen, const uint8_t* data, size_t dataLen, uint8_t* out32) {
  SHA256 sha256;
  sha256.resetHMAC(key, keyLen);
  sha256.update(data, dataLen);
  sha256.finalizeHMAC(key, keyLen, out32, 32);
}

// Deriva le 16 chiavi settoriali (A o B) per un tag Bambu dato il suo UID.
// context: "RFID-A" per le A-key, "RFID-B" per le B-key.
// Scrive 16 chiavi da 6 byte in keysOut (96 byte totali).
void bambuDeriveKeys(const uint8_t* uid, uint8_t uidLen, const char* context, uint8_t keysOut[16][6]) {
  // HKDF-Extract: PRK = HMAC-SHA256(salt=master_secret, IKM=uid)
  uint8_t prk[32];
  hmacSha256(BAMBU_MASTER_SECRET, 16, uid, uidLen, prk);

  // info = context + byte nullo finale (es. "RFID-A\0" = 7 byte)
  uint8_t info[8];
  size_t contextLen = strlen(context);
  memcpy(info, context, contextLen);
  info[contextLen] = 0x00;
  size_t infoLen = contextLen + 1;

  // HKDF-Expand: servono 96 byte totali (16 chiavi × 6 byte) = 3 blocchi da 32 byte
  uint8_t okm[96];
  uint8_t t[32]; size_t tLen = 0;
  uint8_t counter = 1;
  size_t written = 0;

  while (written < 96) {
    // T(i) = HMAC-SHA256(PRK, T(i-1) || info || counter)
    uint8_t buf[32 + 8 + 1];
    size_t bufLen = 0;
    memcpy(buf, t, tLen); bufLen += tLen;
    memcpy(buf + bufLen, info, infoLen); bufLen += infoLen;
    buf[bufLen++] = counter;

    hmacSha256(prk, 32, buf, bufLen, t);
    tLen = 32;

    size_t toCopy = min((size_t)32, 96 - written);
    memcpy(okm + written, t, toCopy);
    written += toCopy;
    counter++;
  }

  // Suddividi in 16 chiavi da 6 byte
  for (int i = 0; i < 16; i++) {
    memcpy(keysOut[i], okm + (i * 6), 6);
  }
}

// Legge e decodifica un tag Bambu Lab autenticato via Mifare Classic.
// Ritorna dati validi solo se l'autenticazione e la lettura riescono.
BambuTagData readBambuTag(uint8_t* uid, uint8_t uidLength) {
  BambuTagData result;

  if (uidLength != 4) return result; // I tag Bambu hanno UID a 4 byte

  uint8_t aKeys[16][6];
  bambuDeriveKeys(uid, uidLength, "RFID-A", aKeys);

  // Block 1 (settore 0): Tray Info Index (material variant + material ID)
  // Block 2 (settore 0): Filament Type
  // Block 4 (settore 1): Detailed Filament Type
  // Block 5 (settore 1): Color RGBA, Weight, Diameter
  // Block 6 (settore 1): Temperature info
  //
  // VERIFICATO contro dati reali (database BambuMan, 14 campioni ABS/ABS-GF):
  //   - Block 1 offset 8-15: Material ID (es. "GFB50") ✓
  //   - Block 2/4: Filament Type / Detailed Type (ASCII) ✓
  //   - Block 5 offset 0-2: colore RGB ✓, offset 4-5: peso grammi ✓,
  //     offset 8-11: diametro come float LE ✓ (non ancora letto qui)
  //   - Block 6 offset 0-1: dry_temp ✓, offset 2-3: dry_time ✓,
  //     offset 8-9: nozzle max ✓, offset 10-11: nozzle min ✓
  //   NON VERIFICATO: bed_temp — nei campioni disponibili (solo famiglia
  //   ABS) risultava sempre 0, offset probabilmente sbagliato o campo
  //   altrove. Il server applica un fallback per famiglia di materiale
  //   quando il valore letto è 0, invece di salvare un dato palesemente
  //   errato.

  uint8_t block1[16], block2[16], block4[16], block5[16], block6[16];

  if (!nfc.mifareclassic_AuthenticateBlock(uid, uidLength, 1, 0, aKeys[0])) return result;
  if (!nfc.mifareclassic_ReadDataBlock(1, block1)) return result;
  if (!nfc.mifareclassic_ReadDataBlock(2, block2)) return result;

  if (!nfc.mifareclassic_AuthenticateBlock(uid, uidLength, 4, 0, aKeys[1])) return result;
  if (!nfc.mifareclassic_ReadDataBlock(4, block4)) return result;
  if (!nfc.mifareclassic_ReadDataBlock(5, block5)) return result;
  if (!nfc.mifareclassic_ReadDataBlock(6, block6)) return result;

  // Block 1: byte 8-15 = Material ID (ASCII, es. "GFA50")
  char matId[9] = {0};
  memcpy(matId, block1 + 8, 8);
  result.materialId = String(matId);
  result.materialId.trim();

  // Block 2: 16 byte ASCII = Filament Type (es. "PLA")
  char filType[17] = {0};
  memcpy(filType, block2, 16);
  result.filamentType = String(filType);
  result.filamentType.trim();

  // Block 4: 16 byte ASCII = Detailed Filament Type (es. "PLA Basic")
  char detType[17] = {0};
  memcpy(detType, block4, 16);
  result.detailedType = String(detType);
  result.detailedType.trim();

  // Block 5: byte 0-3 = RGBA colore, byte 4-5 = peso in grammi (uint16 LE)
  result.colorR = block5[0];
  result.colorG = block5[1];
  result.colorB = block5[2];
  result.weightGrams = block5[4] | (block5[5] << 8);

  // Block 6: temperature, tutte uint16 LE
  // offset 0-1 dry temp, 2-3 dry time, 4-5 bed temp type, 6-7 bed temp,
  // 8-9 max hotend, 10-11 min hotend
  result.bedTempC       = block6[6]  | (block6[7]  << 8);
  result.nozzleTempMaxC = block6[8]  | (block6[9]  << 8);
  result.nozzleTempMinC = block6[10] | (block6[11] << 8);

  result.valid = (result.filamentType.length() > 0);
  return result;
}
