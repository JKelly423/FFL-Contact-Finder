
/*
USEFUL LINKS
============
https://medium.com/@rishabhpriyadarshi/web-scrapping-with-puppeteer-some-basic-examples-7b20524b6a93/
https://www.fflregistry.com/
 */

const CONFIG = require('./config.json');
const STATES_FILE = require('./states.json');

const fs = require('fs');
const {Cluster} = require('puppeteer-cluster'); // Create puppeteer-cluster for concurrent operations

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
        const grabFromRow = (row, classname) => row
            .querySelector(`td.${classname}`)   // grab the TD with the classname
            .innerText                          // grab the text
            .trim();                            // trim the text to remove spaces

        /* Go to specified URL */
        await page.goto(url);

        /* Wait for page's table to load before evaluating*/
        try {
            await page.waitForSelector(CONFIG.cssSelectors.table, {
                timeout: 3000
            });
            console.log(`${url} | Table Loaded`);
        } catch (error) {
            console.log(`\nProblem loading table | ${url}`);
        }

        /* Evaluate the table */
        // Note to self: Pulling each company URL from the table and then evaluating the page is the most efficient way to do this; as there is an unknown amount of data in the table
    });

    /* Queue each URL for Tasking */
    for(let url of urls) {
        cluster.queue(url); // Queue each url
        console.log("qued " + url);
    }

    /* Wait for all tasks to finish */
    await cluster.idle();
    /* Close the Cluster */
    await cluster.close();
})();

