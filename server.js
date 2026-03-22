const express = require("express")
const fetch = require("node-fetch")
const fs = require("fs")
const path = require("path")
const app = express()
require("dotenv").config()

const PORT = process.env.PORT || 8080

app.use(express.static("public"))
app.use(express.json())

const progress = { completed: 0, total: 0 }

const lightspeedCategoryNumbers = [
  6, 9, 10, 14, 15, 18, 20, 29, 30, 36, 37, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51, 57, 58, 59, 69, 73, 75, 76, 77,
  79, 83, 84, 85, 99, 129, 131, 132, 139, 140, 900,
]

const fortiguardCategoryNumbers = [
  0, 9, 28, 29, 30, 31, 33, 34, 35, 36, 39, 40, 41, 42, 43, 44, 46, 47, 49, 50, 51, 52, 53, 63, 75, 76, 77, 78, 79, 80,
  81, 82, 84, 92,
]

const lightspeedCategoriesPath = path.join(__dirname, "./public/lightspeed-categories.json")
const lightspeedCategories = JSON.parse(fs.readFileSync(lightspeedCategoriesPath, "utf8"))

async function fetchCategorization(url) {
  try {
    const response = await fetch("https://production-archive-proxy-api.lightspeedsystems.com/archiveproxy", {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-US,en;q=0.9",
        authority: "production-archive-proxy-api.lightspeedsystems.com",
        "content-type": "application/json",
        origin: "https://archive.lightspeedsystems.com",
        "user-agent": "Mozilla/5.0",
        "x-api-key": "onEkoztnFpTi3VG7XQEq6skQWN3aFm3h",
      },
      body: `{"query":"\\nquery getDeviceCategorization($itemA: CustomHostLookupInput!, $itemB: CustomHostLookupInput!){\\n  a: custom_HostLookup(item: $itemA) { cat}\\n  b: custom_HostLookup(item: $itemB) { cat   \\n  }\\n}","variables":{"itemA":{"hostname":"${url}"}, "itemB":{"hostname":"${url}"}}}`,
    })

    if (!response.ok) {
      console.error("Network response was not ok:", response.statusText)
      return { categories: [], status: "Unknown", categoryName: "Unknown" }
    }

    const body = await response.json()
    const categories = [body.data.a.cat, body.data.b.cat]

    // Add detailed logging of the Lightspeed response
    console.log(`Lightspeed API Response for ${url}:`)
    console.log(`Category numbers: ${categories.join(", ")}`)
    console.log(`Raw response: ${JSON.stringify(body)}`)

    const isUnblocked = categories.some((cat) => lightspeedCategoryNumbers.includes(cat))

    let categoryName = "Unknown"
    for (const cat of categories) {
      if (lightspeedCategories[cat]) {
        categoryName = lightspeedCategories[cat]
        break
      }
    }

    return {
      categories,
      status: isUnblocked ? "Unblocked" : "Blocked",
      categoryName,
    }
  } catch (error) {
    console.error("Fetch error:", error)
    return { categories: [], status: "Error", categoryName: "Error" }
  }
}

async function fetchFortiGuard(url) {
  try {
    console.log(`Fetching FortiGuard data for: ${url}`)

    const response = await fetch("https://www.fortiguard.com/learnmore/dns", {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        Authority: "www.fortiguard.com",
        "Content-Type": "application/json;charset=UTF-8",
        Cookie: "cookiesession1=678A3E0F33B3CB9D7BEECD2B8A5DD036; privacy_agreement=true",
        Origin: "https://www.fortiguard.com",
        Referer: "https://www.fortiguard.com/services/sdns",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ value: url, version: 9 }),
    })

    const result = await response.json()

    console.log("FortiGuard API Response:", result)

    if (result.dns) {
      const { rating, categoryname } = result.dns

      console.log(`Rating Type: ${typeof rating}`)
      console.log(`Rating Value: ${rating}`)
      console.log(`Category Name: ${categoryname}`)

      const ratingNumber = Number.parseInt(rating, 10)
      console.log(`Parsed Rating Number: ${ratingNumber}`)

      console.log(`FortiGuard category numbers: ${fortiguardCategoryNumbers}`)

      const isUnblocked = fortiguardCategoryNumbers.includes(ratingNumber)

      return {
        status: isUnblocked ? "Unblocked" : "Blocked",
        category: categoryname || "Unknown",
        rating: ratingNumber,
      }
    } else {
      console.log(`No DNS data found for ${url}`)
      return {
        status: "Unknown",
        category: "Unknown",
        rating: null,
      }
    }
  } catch (error) {
    console.error("Error fetching FortiGuard data:", error)
    return {
      status: "Error",
      category: "Error",
      rating: null,
    }
  }
}

app.post("/check-links", async (req, res) => {
  const { urls, filters } = req.body
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Invalid input: 'urls' must be a non-empty array." })
  }

  const checkLightspeed = filters?.lightspeed !== false
  const checkFortiGuard = filters?.fortiguard !== false

  if (!checkLightspeed && !checkFortiGuard) {
    return res.status(400).json({ error: "At least one filter must be selected." })
  }

  progress.completed = 0
  progress.total = urls.length

  const domainResults = []

  for (const url of urls) {
    const cleanUrl = url.replace(/^https?:\/\//, "").replace(/\/$/, "")
    console.log(`Processing URL: ${cleanUrl}`)

    try {
      const domainResult = {
        url: cleanUrl,
        lightspeed: {
          status: "Not Checked",
          category: "Not Checked",
        },
        fortiguard: {
          status: "Not Checked",
          category: "Not Checked",
        },
      }

      if (checkLightspeed) {
        console.log(`Checking Lightspeed for: ${cleanUrl}`)
        try {
          const lightspeedData = await fetchCategorization(cleanUrl)
          domainResult.lightspeed = {
            status: lightspeedData.status,
            category: lightspeedData.categoryName,
          }
        } catch (lightspeedError) {
          console.error(`Error checking Lightspeed for ${cleanUrl}:`, lightspeedError)
          domainResult.lightspeed = {
            status: "Error",
            category: "Error",
          }
        }
      }

      if (checkFortiGuard) {
        console.log(`Checking FortiGuard for: ${cleanUrl}`)
        try {
          const fortiguardData = await fetchFortiGuard(cleanUrl)
          domainResult.fortiguard = {
            status: fortiguardData.status,
            category: fortiguardData.category,
          }
        } catch (fortiguardError) {
          console.error(`Error checking FortiGuard for ${cleanUrl}:`, fortiguardError)
          domainResult.fortiguard = {
            status: "Error",
            category: "Error",
          }
        }
      }

      domainResults.push(domainResult)
    } catch (error) {
      console.error(`Error processing ${cleanUrl}:`, error)
      domainResults.push({
        url: cleanUrl,
        lightspeed: {
          status: checkLightspeed ? "Error" : "Not Checked",
          category: checkLightspeed ? "Error" : "Not Checked",
        },
        fortiguard: {
          status: checkFortiGuard ? "Error" : "Not Checked",
          category: checkFortiGuard ? "Error" : "Not Checked",
        },
      })
    } finally {
      progress.completed++
    }
  }

  console.log("Final Results:", domainResults)

  res.json({
    domains: domainResults,
  })
})

app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")

  const interval = setInterval(() => {
    const percentage = Math.round((progress.completed / progress.total) * 100)
    res.write(`data: ${JSON.stringify({ percentage })}\n\n`)

    if (progress.completed === progress.total) {
      clearInterval(interval)
      res.end()
    }
  }, 100)
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

