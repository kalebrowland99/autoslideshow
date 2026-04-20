export function getBrand(config = {}) {
  const appId = config.appId === "valcoin" ? "valcoin" : "thrifty";
  if (appId === "valcoin") {
    return {
      appId,
      appName: "Valcoin",
      slideshowName: "Valcoin Slideshows",
      appLower: "valcoin",
      appCategory: "coinscan",
    };
  }
  return {
    appId,
    appName: "Thrifty",
    slideshowName: "Thrifty Slideshows",
    appLower: "thrifty",
    appCategory: "reselling",
  };
}

