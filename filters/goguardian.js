const { fetchURL } = require("./fetch.js");
const crypto = require("crypto");
const { TextEncoder, TextDecoder } = require("util");
const fs = require("fs");
const path = require("path");
const goguardiancats = JSON.parse(
  fs.readFileSync(path.join(__dirname, "json/goguardian.json"), "utf8")
);

// GoGuardian's categories API requires a bearer token. The old default host
// (supercoolgenizy/superman) no longer exists, so point GOGUARDIAN_TOKEN_URL
// at a live source of the OpenSSL-encrypted token to get real verdicts.
const GOGUARDIAN_TOKEN_URL =
  process.env.GOGUARDIAN_TOKEN_URL ||
  "https://raw.githubusercontent.com/supercoolgenizy/superman/refs/heads/main/lol";

async function goguardian(urlToCheck) {
  try {
    const PUBLIC_KEY = "82fdbf93-6361-454a-9460-e03bc2baaeff";
    const PASSWORD_PREFIX = "59afe4da-9a47-4cff-b024-c9e8fab53eb1";

    const password = new TextEncoder().encode(PASSWORD_PREFIX + PUBLIC_KEY);

    function concatUint8(...arrays) {
      let total = arrays.reduce((s, a) => s + a.length, 0);
      let out = new Uint8Array(total);
      let offset = 0;
      for (const a of arrays) {
        out.set(a, offset);
        offset += a.length;
      }
      return out;
    }

    function md5(data) {
      return Uint8Array.from(
        crypto.createHash("md5").update(Buffer.from(data)).digest()
      );
    }
    function evpBytesToKey(password, salt) {
      let derived = new Uint8Array(0);
      let prev = new Uint8Array(0);

      while (derived.length < 48) {
        const input = concatUint8(prev, password, salt);
        prev = md5(input);
        derived = concatUint8(derived, prev);
      }

      return {
        key: derived.slice(0, 32),
        iv: derived.slice(32, 48),
      };
    }

    async function decryptOpenSSL(encryptedB64, password) {
      const raw = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));

      const header = new TextDecoder().decode(raw.slice(0, 8));
      if (header !== "Salted__") {
        throw new Error("Invalid OpenSSL salt header");
      }

      const salt = raw.slice(8, 16);
      const ciphertext = raw.slice(16);

      const { key, iv } = await evpBytesToKey(password, salt);

      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "AES-CBC" },
        false,
        ["decrypt"]
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv },
        cryptoKey,
        ciphertext
      );

      return new TextDecoder().decode(decrypted);
    }

    const lolUrl = GOGUARDIAN_TOKEN_URL + "?" + Date.now();
    const lolText = await fetchURL(lolUrl).then((res) => res.text());
    const token = await decryptOpenSSL(lolText, password);

    const body = JSON.stringify({
      cleanUrl: urlToCheck.replace(/^https?:\/\//, ""),
      rawUrl: urlToCheck,
    });

    const headers = {
      authorization: `Bearer ${token}`,
      "extension-version": "4.1.210",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
      "content-type": "text/plain;charset=UTF-8",
      accept: "*/*",
      origin: "chrome-extension://haldlgldplgnggkjaafhelgiaglafanh",
    };

    const apiResponse1 = await fetchURL(
      "https://panther.goguardian.com/api/v2/categories",
      {
        method: "POST",
        headers,
        body,
      }
    ).then((res) => res.text());
    const apiResponse = JSON.parse(apiResponse1);

    if (apiResponse.error || !Array.isArray(apiResponse.cats)) {
      throw new Error(apiResponse.message || "GoGuardian API returned no categories");
    }

    const cats = apiResponse.cats;

    let pairs = cats
      .filter((cat) => goguardiancats[cat])
      .map((cat) => ({
        name: goguardiancats[cat][0],
        blocked: goguardiancats[cat][1],
      }));

    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
    }

    const catsName = pairs.map((p) => p.name);
    const shouldblocked = pairs.some((p) => p.blocked);

    return [catsName.join(", "), shouldblocked];
  } catch (err) {
    console.warn("GoGuardian Error:", err);
    return "Error";
  }
}

module.exports = { goguardian };