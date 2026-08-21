const { fetchURL } = require("./fetch.js");

async function linewize(domain) {
	try {
		const res = await fetchURL("https://mvgateway.syd-1.linewize.net/get/verdict?deviceid=PHYS-SMIC-US-0000-3190&cev=3.3.0&identity=null&requested_website=" + encodeURIComponent(domain));
		const json = await res.json();
		const blockedCategories = ["animeandmanga", "dynamicdns", "trackers", "celebrities", "entertainment", "humouranddistractions", "livestreaming", "media", "socialmediaandcommunication", "marijuana", "crypto", "gamestorespublishers", "videogames", "blocklist.proxies", "aitools", "blocklist.dating", "blocklist.piracy", "whatsmyipservices", "p2p", "unsafesearchengines", "porn", "extreme", "malware", "matureandexplicit", "gamingresources", "offensive"];
		let subCategory = json.signatures?.subCategory?.replaceAll("sphirewall.application.", "").replaceAll("sphirewall.category.", "");
		if (!subCategory) {
			subCategory = "Not rated";
		}
		let category = json.signatures?.category?.replaceAll("sphirewall.application.", "").replaceAll("sphirewall.category.", "");
		let blocked = blockedCategories.includes(category) || blockedCategories.includes(subCategory);
		if (subCategory === "Not rated") {
			blocked = false;
		}
		return [subCategory, subCategory.startsWith("blocklist.") ? true : blocked];
	} catch (err) {
		console.warn("Linewize Error: " + err);
		return `Error`;
	}
}

module.exports = {linewize};