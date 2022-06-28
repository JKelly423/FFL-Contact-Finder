
/*
USEFUL LINKS
============
https://medium.com/@rishabhpriyadarshi/web-scrapping-with-puppeteer-some-basic-examples-7b20524b6a93/
https://www.fflregistry.com/
 */

const CONFIG = require('./config.json');
const STATES_FILE = require('./states.json');

const fs = require('fs');
const {Cluster} = require('puppeteer-cluster'); // Use puppeteer-cluster for concurrent operations

const timeout = millis => new Promise(resolve => setTimeout(resolve, millis));  // Declare timeout for web requests

/* Convert State List to URL List */
var urls = [];  // Declare array for urls
for(let state of STATES_FILE.states) {
    urls.push(CONFIG.siteDetails.pageURL + state);  // Add url for each state to array
}

/**
 * Main Asynchronous Function (Driver Function)
 */
(async () => {
    /* Create Cluster */
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 2,
        puppeteerOptions: CONFIG.chromeOptions,
    });

    /* Define a Cluster Task */
    await cluster.task(async ({ page, data: url }) => {
        /* Go to specified URL */
        await page.goto(url);

        /* Wait for page's table to load before evaluating*/
        try {
            await page.waitForSelector(CONFIG.cssSelectors.table, {
                timeout: timeout
            });
        } catch (error) {
            console.log(`\nProblem loading table | ${url}`);
            console.log(error);
        }

        /* Grab all links to individual pages from table */
        try{
            var contactPageURLs = await page.evaluate(() => {
                let arr = Array.from(document.querySelectorAll('table.x-grid3-row-table > tbody > tr > td.x-grid3-col.x-grid3-cell.x-grid3-td-contact > div > a'));
                console.log("Len: " + arr.length);
                return arr.map(a => a.href);
            });
        } catch(error) {
            console.log(error);
        }

        console.log("\nEvaluated Table");
        console.log(contactPageURLs);
        /* Go to each contact page and evaluate it*/
        for(let contactPageURL of contactPageURLs) {
            await page.goto(contactPageURL);
            console.log(`\nEvaluating Contact Page | ${contactPageURL}`);
            try {
                let name = await page.evaluate(() => {
                    let selector = 'body > div.w3-content.w3-container.w3-padding-64 > h1';
                    return document.querySelector(selector).innerText;
                });
                console.log(`\nName: ${name}`);
            } catch (error){
                console.log(error);
            }
        }
    });

    /* Queue each URL for Tasking */
    for(let url of urls) {
        await cluster.queue(url); // Queue each url
        console.log("queued " + url);
    }

    /* Wait for all tasks to finish */
    await cluster.idle();
    /* Close the Cluster */
    await cluster.close();
})();