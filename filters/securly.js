const { fetchURL } = require("./fetch.js")
const fetchCookie = require("fetch-cookie").default
const { CookieJar } = require("tough-cookie")

const jar = new CookieJar()
const fetchWithCookies = fetchCookie(fetchURL, jar)

async function securly(url) {
  try {
    let raw = url.includes("://") ? url.split("://")[1] : url
    raw = raw.split("?")[0].split("#")[0]
    const encodedUrl = Buffer.from(raw).toString("base64")

    const response = await fetchWithCookies(
      `https://uswest-www.securly.com/crextn/broker?useremail=admin@edison.k12.ca.us&chrome=true&reason=crextn&version=-&cu=https://uswest-www.securly.com/crextn&uf=1&cf=1&host=${raw}&url=${encodedUrl}`,
    )
    const html = await response.text()
    const [status, policyId, categoryId] = html.split(":")

    const detailsResponse = await fetchWithCookies(
      `https://www.securly.com/blocked?useremail=admin@edison.k12.ca.us&chrome=true&reason=globalblacklist&keyword=&extension_id=kfiocjonplkilcjfgabfngiddebalkod&extension_version=3.0.21&categoryid=${categoryId}&policyid=${policyId}&url=${encodedUrl}`,
    )
    const detailsHtml = await detailsResponse.text()
    const category = detailsHtml.split(`params['categories'] = "`)[1]?.split(`"`)[0] || "Unknown"

    return [category, status.replace("\n", "") !== "ALLOW"]
  } catch (error) {
    console.warn("Securly Error:", error)
    return "Error"
  }
}

module.exports = { securly }
