const fs = require("fs")
const path = require("path")
const WebSocket = require("ws")

const lightspeedJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, "json/lightspeed.json"), "utf8"),
)

// The endpoint is intentionally blank for now; set it when the provider-specific
// WebSocket endpoint is available. Environment variables make deployment easier.
const LIGHTSPEED_WEBSOCKET_URL = process.env.LIGHTSPEED_WEBSOCKET_URL || "wss://production-gc.lsfilter.com?a=0ef9b862-b74f-4e8d-8aad-be549c5f452a&customer_id=74-1082-F000&agentType=chrome_extension&agentVersion=3.777.0&userGuid=00000000-0000-0000-0000-000000000000"
const LIGHTSPEED_IP = process.env.LIGHTSPEED_IP || "174.85.104.135"
const LIGHTSPEED_CUSTOMER_ID = process.env.LIGHTSPEED_CUSTOMER_ID || "74-1082-F000"

function lightspeedCategorize(number) {
  const category = lightspeedJson.find((entry) => entry.CategoryNumber == number)
  if (!category) return null

  return [category.CategoryName, category.Allow == 1]
}

async function lightspeed(url) {
  return new Promise((resolve, reject) => {
    let socket

    try {
      socket = new WebSocket(LIGHTSPEED_WEBSOCKET_URL)
    } catch (error) {
      reject(error)
      return
    }

    socket.once("open", () => {
      socket.send(
        JSON.stringify({
          action: "dy_lookup",
          host: url,
          ip: LIGHTSPEED_IP,
          customerId: LIGHTSPEED_CUSTOMER_ID,
        }),
      )
    })

    socket.once("message", (message) => {
      socket.close()

      try {
        const response = JSON.parse(message.toString())
        resolve(lightspeedCategorize(response.cat) || ["Uncategorized", false])
      } catch (error) {
        reject(error)
      }
    })

    socket.once("error", reject)
  })
}

module.exports = { lightspeed }
