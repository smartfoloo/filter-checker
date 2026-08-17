const express = require("express")
const fetch = require("node-fetch")
const fs = require("fs")
const path = require("path")
require("dotenv").config()

const { lightspeed } = require("./filters/lightspeed.js")
const { securly } = require("./filters/securly.js")
const { contentkeeper } = require("./filters/contentkeeper.js")
const app = express()

const PORT = Number(process.argv[2] || process.env.PORT) || 8080;

app.use(express.static("public"))
app.use(express.json())

const progress = { completed: 0, total: 0 }

const fortiguardCategoryNumbers = [
  0, 9, 28, 29, 30, 31, 33, 34, 35, 36, 39, 40, 41, 42, 43, 44, 46, 47, 49, 50, 51, 52, 53, 63, 75, 76, 77, 78, 79, 80,
  81, 82, 84, 92,
]

const ciscoBlockedPath = path.join(__dirname, "./public/cisco-blocked.json")
const ciscoBlocked = JSON.parse(fs.readFileSync(ciscoBlockedPath, "utf8"))

function tupleResult(result) {
  if (result === "Error" || !Array.isArray(result)) {
    return { status: "Error", category: "Error" }
  }

  const [category, allowed] = result
  return {
    status: allowed ? "Unblocked" : "Blocked",
    category: category || "Unknown",
  }
}

function contentKeeperResult(result) {
  if (result === "Error" || !result || typeof result !== "object") {
    return { status: "Error", category: "Error" }
  }

  return {
    status: result.blocked ? "Blocked" : "Unblocked",
    category: result.category || "Unknown",
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

async function fetchCisco(url) {
  try {
    console.log(`Fetching Cisco Talos data for: ${url}`)

    const response = await fetch(`https://talosintelligence.com/cloud_intel/url_reputation?url=${encodeURIComponent(url)}`)

    if (!response.ok) {
      console.error("Cisco Talos response was not ok:", response.statusText)
      return { status: "Unknown", categoryName: "Unknown" }
    }

    const body = await response.json()
    const categoryEntries = body?.reputation?.aup_cat || []
    const categories = categoryEntries.map((entry) => entry.name)

    if (categories.length === 0) {
      return { status: "Blocked", categoryName: "Not rated" }
    }

    const isBlocked = categories.some((cat) => ciscoBlocked.includes(cat))

    return {
      status: isBlocked ? "Blocked" : "Unblocked",
      categoryName: categories.join(", "),
    }
  } catch (error) {
    console.error("Error fetching Cisco Talos data:", error)
    return { status: "Error", categoryName: "Error" }
  }
}

app.post("/check-links", async (req, res) => {
  const { urls, filters } = req.body
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Invalid input: 'urls' must be a non-empty array." })
  }

  const checkLightspeed = filters?.lightspeed !== false
  const checkFortiGuard = filters?.fortiguard !== false
  const checkCisco = filters?.cisco === true
  const checkSecurly = filters?.securly === true
  const checkContentKeeper = filters?.contentkeeper === true

  if (!checkLightspeed && !checkFortiGuard && !checkCisco && !checkSecurly && !checkContentKeeper) {
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
        cisco: {
          status: "Not Checked",
          category: "Not Checked",
        },
        securly: {
          status: "Not Checked",
          category: "Not Checked",
        },
        contentkeeper: {
          status: "Not Checked",
          category: "Not Checked",
        },
      }

      if (checkLightspeed) {
        console.log(`Checking Lightspeed for: ${cleanUrl}`)
        try {
          domainResult.lightspeed = tupleResult(await lightspeed(cleanUrl))
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

      if (checkCisco) {
        console.log(`Checking Cisco Talos for: ${cleanUrl}`)
        try {
          const ciscoData = await fetchCisco(cleanUrl)
          domainResult.cisco = {
            status: ciscoData.status,
            category: ciscoData.categoryName,
          }
        } catch (ciscoError) {
          console.error(`Error checking Cisco Talos for ${cleanUrl}:`, ciscoError)
          domainResult.cisco = {
            status: "Error",
            category: "Error",
          }
        }
      }

      if (checkSecurly) {
        console.log(`Checking Securly for: ${cleanUrl}`)
        try {
          domainResult.securly = tupleResult(await securly(cleanUrl))
        } catch (securlyError) {
          console.error(`Error checking Securly for ${cleanUrl}:`, securlyError)
          domainResult.securly = {
            status: "Error",
            category: "Error",
          }
        }
      }

      if (checkContentKeeper) {
        console.log(`Checking ContentKeeper for: ${cleanUrl}`)
        try {
          domainResult.contentkeeper = contentKeeperResult(await contentkeeper(cleanUrl))
        } catch (contentKeeperError) {
          console.error(`Error checking ContentKeeper for ${cleanUrl}:`, contentKeeperError)
          domainResult.contentkeeper = {
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
        cisco: {
          status: checkCisco ? "Error" : "Not Checked",
          category: checkCisco ? "Error" : "Not Checked",
        },
        securly: {
          status: checkSecurly ? "Error" : "Not Checked",
          category: checkSecurly ? "Error" : "Not Checked",
        },
        contentkeeper: {
          status: checkContentKeeper ? "Error" : "Not Checked",
          category: checkContentKeeper ? "Error" : "Not Checked",
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
    const percentage = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0
    res.write(`data: ${JSON.stringify({ percentage })}\n\n`)

    if (progress.total > 0 && progress.completed === progress.total) {
      clearInterval(interval)
      res.end()
    }
  }, 100)

  req.on("close", () => clearInterval(interval))
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
