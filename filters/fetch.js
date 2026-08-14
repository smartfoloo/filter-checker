const fetch = require("node-fetch")

function fetchURL(url, options) {
  return fetch(url, options)
}

module.exports = { fetchURL }
