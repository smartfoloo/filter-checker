const { fetchURL } = require("./fetch.js");
const fs = require("fs");
const path = require("path");
const lanschooljson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "json/lanschool.json"), "utf8")
);

// LanSchool filtering runs on Netsweeper appliances. The original endpoint
// (filter.coopacademiescloud.netsweeper.com) is dead; the default below is a
// live UK tenant. Override LANSCHOOL_URL to point at another appliance.
const LANSCHOOL_URL =
  process.env.LANSCHOOL_URL || "https://filter.wavenetcloud.netsweeper.com:3431";

// LanSchool/Netsweeper "001 <url> - - - - <requestid>" lookup, base64-encoded.
function buildLookup(domain) {
  return Buffer.from(`001 https://${domain} - - - - 3372822944`).toString("base64");
}

function parseBlockedCategories(text) {
  const catMatch = text.match(/[?&]cat=([^&\s]+)/);
  if (!catMatch) return "Unknown";
  return catMatch[1]
    .split(",")
    .map((id) => lanschooljson[id] || id)
    .join(", ");
}

async function lanschool(url) {
  try {
    const res = await fetchURL(LANSCHOOL_URL + "/" + buildLookup(url));
    const text = await res.text();

    if (text.startsWith("ALLOW")) {
      return ["Allowed", false];
    }

    return [parseBlockedCategories(text), true];
  } catch (err) {
    console.warn("LanSchool Error:", err);
    return "Error";
  }
}

module.exports = { lanschool };
