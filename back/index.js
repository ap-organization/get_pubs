"use strict";

// packages
const puppeteer = require("puppeteer");
const chalk = require("chalk");
const { GoogleSpreadsheet } = require("google-spreadsheet");
// params
const params = require("./params.json");
// helpers
const {
  goOnUrl,
  scrollDownPage,
  waitForSeconds,
  getBrowser,
  getPage,
  getDoc,
  getSheet,
  closePuppeteer
} = require("./helpers.js");

const errors = {
  "!query": "!query: bad inputs, need [target_lead]",
  "!gsheet": "!gsheet: could not connect to google sheet",
  "!puppeteer": "!puppeteer: could not launch puppeteer",
  "?": "?"
};

/**
 * getdepartments Urls
 * @param {Object} page
 */
const getDepartments = async page => {
  console.log(chalk.yellow("--- getDepartments"));
  let hrefs = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(".DepartmentList-item"),
      a => "https://nickel.eu" + a.getAttribute("href")
    )
  );
  console.log(chalk.yellow("nb department to scrap:"), hrefs.length);
  return hrefs;
};

/**
 *
 * @param {*} page
 * @param {*} url
 * @param {*} sheet
 */
const parseDepartment = async (page, url, sheet) => {

  await goOnUrl(page, url);

  let hrefs = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(".agency"),
      a => "https://nickel.eu" + a.getAttribute("href")
    )
  );

  let data = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(".agency"),
      elem => elem.innerText
    )
  );

  await waitForSeconds(5);
  let pubs = [];
  for (let i = 0; i < hrefs.length; i++) {
	let tab = data[i].split('\n');
	try {
		let pub = {
			department_url: url,
			pub_name: tab[0],
			pub_address: tab[1],
			pub_number: tab.length >= 2 ? tab[2]: '',
			pub_url: hrefs[i],
		};
		try {
			if (pub.pub_number.includes('Fermé')) {
				pub.pub_number = '';
			}
		} catch (err) {
			console.log('');
		}
		// await sheet.addRow(pub);
		pubs.push(pub);
		console.table(pub);
	} catch (err) {
		console.log('err:', err);
	} finally {
		console.table(tab);
	}
  }
  await sheet.addRows(pubs);
};

/**
 * @params (Object) req - request with query params
 * @params (Object) res - json response
 */
exports.pubsScrapper = async (req, res) => {
  console.log(chalk.cyan("--- inside main"));
  /* -------------------------------- */
  // debug
  /* -------------------------------- */
  let DEBUG = false;
  console.log(chalk.yellow("req.method:"), JSON.stringify(req.method));
  console.log(chalk.yellow("req.params:"), JSON.stringify(req.params));
  console.log(
    chalk.yellow("req.query: "),
    JSON.stringify(req.query).substring(0, 40),
    "..."
  );
  console.log(chalk.yellow("req.body:  "), JSON.stringify(req.body));
  /* -------------------------------- */

  let doc;
  let sheet;
  let urls = [];
  try {
    doc = await getDoc();
    sheet = await getSheet(doc, "urls");
    await sheet.loadCells("A2:A2");
    const a2 = sheet.getCell(1, 0);
    console.log("a2.value:", a2.value);
    urls.push(a2.value);
  } catch (e) {
    console.log(chalk.red("error:", e));
    res.status(422).send({ error: errors["!gsheet"] });
    return;
  }

  let browser;
  let page;
  try {
    const isHeadless = false;
    let puppeteer_args = [
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-setuid-sandbox",
      "--no-first-run",
      "--no-zygote",
      "--proxy-bypass-list=*",
      "--deterministic-fetch"
    ];
    browser = await getBrowser(puppeteer_args, isHeadless);
    page = await getPage(browser);
  } catch (e) {
    console.log(chalk.red("error:", e));
    res.status(422).send({ error: errors["!puppeteer"] });
    return;
  }

  try {
    // 1
    console.log("url =", urls[0]);
    await goOnUrl(page, urls[0]);
    await scrollDownPage(page);
    // 2
	let departmentUrls = await getDepartments(page);
	console.table(departmentUrls);
	//
    let departments = [];
	let index = 0;
	sheet = await getSheet(doc, "data");
    for (let i = 0; i < departmentUrls.length; i++) {
	  console.log("------------- departement n°" + (i + 1).toString());
      await parseDepartment(
        page,
        departmentUrls[i],
        sheet
      );
    }
    console.table(departments);
    await writeInSheet(headers, departments, doc, index);
  } catch (e) {
    console.log(chalk.red("error:", e));
    res.status(422).send({ error: errors["?"] });
  } finally {
    await closePuppeteer(browser, page);
    res.status(200).send({ ok: "ok" });
  }
};
