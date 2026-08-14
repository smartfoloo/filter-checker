const fs = require("fs")
const path = require("path")
const { fetchURL } = require("./fetch.js")

const contentKeeperJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "json/contentkeeper.json"), "utf8"),
)

// The lookup URL is intentionally blank for now; fill it in with the provider
// endpoint when available, or provide CONTENTKEEPER_URL at runtime.
const CONTENTKEEPER_URL = process.env.CONTENTKEEPER_URL || "https://ckf01.barringtonschools.org/cgi-bin/ck/re_u.cgi"

function readCell(html, style) {
  return html.split(`<td align='LEFT' style='color: ${style};'>`)[1]?.split("</td>")[0].trim() || ""
}

async function contentkeeper(url) {
  try {
    const domain = url.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    const response = await fetchURL(CONTENTKEEPER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        USER: "",
        URL_AREA: domain,
        NUM_SUBMIT_URL: "1",
        SEL_1: "29",
        CAT_1: "-1",
        URL_1: domain,
        DAT_1: "Global",
        SUBMIT_SITE_SECOND_CANCEL: "Cancel",
      }),
    })

    const html = await response.text()
    const category = readCell(html, "Blue") || readCell(html, "#ff0000")
    const blocked = contentKeeperJson[category] ? contentKeeperJson[category] === "B" : true
    const location = html.split("<input type='Hidden' name='DAT_1' value='")[1]?.split("'>")[0] || "n/a"

    return {
      blocked,
      category: `${category || "Unknown"} (${location === "n/a" ? "Global" : location})`,
    }
  } catch (error) {
    console.warn("ContentKeeper Error:", error)
    return "Error"
  }
}

module.exports = { contentkeeper }
