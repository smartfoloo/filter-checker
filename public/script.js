const FILTERS = [
  { key: "lightspeed", label: "Lightspeed", buttonId: "lightspeedFilter" },
  { key: "fortiguard", label: "FortiGuard", buttonId: "fortiguardFilter" },
  { key: "cisco", label: "Cisco Talos", buttonId: "ciscoFilter" },
  { key: "securly", label: "Securly", buttonId: "securlyFilter" },
  { key: "contentkeeper", label: "ContentKeeper", buttonId: "contentkeeperFilter" },
]

const inputScreen = document.getElementById("inputScreen")
const loadingScreen = document.getElementById("loadingScreen")
const resultsScreen = document.getElementById("resultsScreen")

const inputText = document.getElementById("inputText")
const checkButton = document.getElementById("checkButton")
const newCheckButton = document.getElementById("newCheckButton")
const progressFill = document.getElementById("progressFill")
const progressTrack = document.querySelector(".progress-track")
const loadingText = document.getElementById("loadingText")
const filterError = document.getElementById("filterError")
const errorBanner = document.getElementById("errorBanner")
const resultsBody = document.getElementById("resultsBody")
const copyAllButton = document.getElementById("copyAllButton")
const copyDropdown = document.getElementById("copyDropdown")
const copyDropdownList = document.getElementById("copyDropdownList")

let progressSource = null
let lastResults = { domains: [], activeFilters: [] }

function showScreen(screen) {
  for (const s of [inputScreen, loadingScreen, resultsScreen]) {
    s.hidden = s !== screen
  }
}

function getSelectedFilters() {
  return FILTERS.filter((f) => document.getElementById(f.buttonId).getAttribute("aria-pressed") === "true")
}

for (const f of FILTERS) {
  document.getElementById(f.buttonId).addEventListener("click", (event) => {
    const pressed = event.currentTarget.getAttribute("aria-pressed") === "true"
    event.currentTarget.setAttribute("aria-pressed", String(!pressed))
    filterError.hidden = true
  })
}

function showError(message) {
  errorBanner.textContent = message
  errorBanner.hidden = false
}

function hideError() {
  errorBanner.hidden = true
}

function extractDomains(text) {
  const domainRegex = /([a-zA-Z0-9-]+(\.[a-zA-Z]{2,}){1,2})/g
  const matches = text.match(domainRegex) || []
  return [...new Set(matches)]
}

function statusClass(status) {
  if (status === "Blocked") return "blocked"
  if (status === "Unblocked") return "unblocked"
  if (status === "Error") return "error"
  if (status === "Not Checked") return "not-checked"
  return "unknown"
}

function renderResultsTable(domains, activeFilters) {
  const table = document.createElement("table")
  table.className = "results-table"

  let header = "<thead><tr><th>Domain</th>"
  for (const f of activeFilters) {
    header += `<th>${f.label}</th>`
  }
  header += "</tr></thead>"

  const rows = domains
    .map((domain) => {
      let row = `<tr><td>${domain.url}</td>`
      for (const f of activeFilters) {
        const result = domain[f.key] || { status: "Unknown", category: "Unknown" }
        row += `
          <td>
            <span class="status-pill ${statusClass(result.status)}">${result.status}</span>
            <div class="category-desc">${result.category || "N/A"}</div>
          </td>
        `
      }
      row += "</tr>"
      return row
    })
    .join("")

  table.innerHTML = header + `<tbody>${rows}</tbody>`

  const card = document.createElement("div")
  card.className = "results-table-card"
  card.appendChild(table)

  resultsBody.innerHTML = ""
  resultsBody.appendChild(card)
}

function unblockedFor(domains, filterKey) {
  return domains.filter((domain) => domain[filterKey]?.status === "Unblocked").map((domain) => domain.url)
}

function unblockedEverywhere(domains, activeFilters) {
  return domains
    .filter((domain) => activeFilters.every((f) => domain[f.key]?.status === "Unblocked"))
    .map((domain) => domain.url)
}

async function copyToClipboard(list, emptyMessage) {
  if (list.length === 0) {
    showError(emptyMessage)
    return
  }
  try {
    await navigator.clipboard.writeText(list.join("\n"))
    hideError()
  } catch (err) {
    showError("Could not copy to clipboard. Your browser may be blocking clipboard access.")
  }
}

function renderCopyDropdown(activeFilters) {
  copyDropdownList.innerHTML = ""
  for (const f of activeFilters) {
    const li = document.createElement("li")
    const a = document.createElement("a")
    a.href = "#"
    a.textContent = `${f.label} only`
    a.addEventListener("click", (event) => {
      event.preventDefault()
      copyDropdown.removeAttribute("open")
      copyToClipboard(unblockedFor(lastResults.domains, f.key), `No unblocked domains found for ${f.label}.`)
    })
    li.appendChild(a)
    copyDropdownList.appendChild(li)
  }
}

document.addEventListener("click", (event) => {
  if (copyDropdown.hasAttribute("open") && !copyDropdown.contains(event.target)) {
    copyDropdown.removeAttribute("open")
  }
})

copyAllButton.addEventListener("click", () => {
  copyToClipboard(
    unblockedEverywhere(lastResults.domains, lastResults.activeFilters),
    "No domains are unblocked across every checked filter.",
  )
})

function setProgress(percentage) {
  progressFill.style.width = `${percentage}%`
  progressTrack.setAttribute("aria-valuenow", String(percentage))
}

function startProgressTracking(total) {
  stopProgressTracking()
  setProgress(0)

  progressSource = new EventSource("/progress")
  progressSource.onmessage = (event) => {
    const data = JSON.parse(event.data)
    setProgress(data.percentage)
    loadingText.textContent = `Checking ${total} domain${total === 1 ? "" : "s"}… ${data.percentage}%`
  }
  progressSource.onerror = () => {
    stopProgressTracking()
  }
}

function stopProgressTracking() {
  if (progressSource) {
    progressSource.close()
    progressSource = null
  }
}

async function checkLinks() {
  hideError()
  filterError.hidden = true

  const activeFilters = getSelectedFilters()
  if (activeFilters.length === 0) {
    filterError.hidden = false
    return
  }

  const domains = extractDomains(inputText.value)
  if (domains.length === 0) {
    filterError.hidden = true
    showError("No domains found in the text above. Paste a list of domains, or any text that contains some.")
    return
  }

  showScreen(loadingScreen)
  loadingText.textContent = `Checking ${domains.length} domain${domains.length === 1 ? "" : "s"}…`
  startProgressTracking(domains.length)

  try {
    const response = await fetch("/check-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: domains,
        filters: {
          lightspeed: activeFilters.some((f) => f.key === "lightspeed"),
          fortiguard: activeFilters.some((f) => f.key === "fortiguard"),
          cisco: activeFilters.some((f) => f.key === "cisco"),
          securly: activeFilters.some((f) => f.key === "securly"),
          contentkeeper: activeFilters.some((f) => f.key === "contentkeeper"),
        },
      }),
    })

    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error(body.error || `Request failed with status ${response.status}`)
    }

    const data = await response.json()

    if (!data?.domains?.length) {
      throw new Error("No results returned.")
    }

    lastResults = { domains: data.domains, activeFilters }
    renderResultsTable(data.domains, activeFilters)
    renderCopyDropdown(activeFilters)
    showScreen(resultsScreen)
  } catch (err) {
    console.error("Error checking links:", err)
    showScreen(inputScreen)
    showError(`Couldn't check those domains: ${err.message}`)
  } finally {
    stopProgressTracking()
  }
}

checkButton.addEventListener("click", checkLinks)

newCheckButton.addEventListener("click", () => {
  hideError()
  showScreen(inputScreen)
})

window.addEventListener("beforeunload", () => {
  stopProgressTracking()
})
