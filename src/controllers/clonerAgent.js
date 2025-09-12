const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");

// ---- Puppeteer Analyzer ----
async function analyzeSite(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded" });

  const data = await page.evaluate(() => {
    const title = document.title;
    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((h) => h.innerText)
      .filter(Boolean);

    const paragraphs = Array.from(document.querySelectorAll("p"))
      .map((p) => p.innerText)
      .filter(Boolean)
      .slice(0, 5);

    return { title, headings, paragraphs };
  });

  await browser.close();
  return data;
}

// ---- Unsplash Search ----
async function fetchImages(query) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error("Missing UNSPLASH_ACCESS_KEY in .env");

  const res = await axios.get(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query
    )}&per_page=3&client_id=${accessKey}`
  );
  return res.data.results.map((img) => img.urls.small);
}

// ---- Agent Logic ----
async function clonerAgent(url) {
  const analysis = await analyzeSite(url);

  const keywords = [analysis.title, ...(analysis.headings || [])]
    .join(" ")
    .split(" ")
    .slice(0, 5);

  const imageResults = [];
  for (let keyword of keywords) {
    try {
      const imgs = await fetchImages(keyword);
      if (imgs.length > 0) {
        imageResults.push({ keyword, images: imgs });
      }
    } catch (err) {
      console.error("Image fetch failed for:", keyword, err.message);
    }
  }

  return { url, analysis, images: imageResults };
}

// ---- API Endpoint ----
// router.post("/analyze", async (req, res) => {
//   try {
//     const { url } = req.body;
//     if (!url) return res.status(400).json({ error: "URL is required" });
//     console.log("first");
//     const result = await clonerAgent(url);
//     res.json(result);
//   } catch (err) {
//     console.error("Error:", err.message);
//     res.status(500).json({ error: "Something went wrong" });
//   }
// });

// const analyze = async (req, res) => {
//   try {
//     const { url } = req.body;
//     if (!url) return res.status(400).json({ error: "URL is required" });

//     const result = await clonerAgent(url);
//     res.json(result);
//   } catch (err) {
//     console.error("Error:", err.message);
//     res.status(500).json({ error: "Something went wrong" });
//   }
// };
async function extractImages(url) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded" });

  const images = await page.evaluate(() => {
    const imgElements = Array.from(document.querySelectorAll("img"));
    return imgElements
      .map((img) => img.getAttribute("src") || img.getAttribute("data-src"))
      .filter(Boolean);
  });

  await browser.close();
  return images;
}

// ---- API Endpoint ----
// const analyze = async (req, res) => {
//   try {
//     const { url } = req.body;
//     if (!url) return res.status(400).json({ error: "URL is required" });

//     const images = await extractImages(url);
//     res.json({ url, images });
//   } catch (err) {
//     console.error("Error:", err.message);
//     res.status(500).json({ error: "Something went wrong" });
//   }
// };
async function fetchImages(query) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error("Missing UNSPLASH_ACCESS_KEY in .env");

  const res = await axios.get(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      query
    )}&per_page=3&client_id=${accessKey}`
  );

  return res.data.results.map((img) => img.urls.small);
}

// ---- API Endpoint ----
const analyze = async (req, res) => {
  try {
    const { query } = req.body; // ✅ now we expect query, not url
    if (!query) return res.status(400).json({ error: "Query is required" });

    const images = await fetchImages(query);

    res.json({ query, images, count: images.length });
  } catch (err) {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
};
module.exports = { analyze };
