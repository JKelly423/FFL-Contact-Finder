
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

        /* Display browser's console within program console */
        page.on('console', async (msg) => {
            const msgArgs = msg.args();
            for (let i = 0; i < msgArgs.length; ++i) {
                console.log(await msgArgs[i].jsonValue());
            }
        });

        console.log("\nEvaluated Table");
        console.log(contactPageURLs);

        /* Go to each contact page and evaluate it*/
        for(let contactPageURL of contactPageURLs) {
            await page.goto(contactPageURL);
            console.log(`\nEvaluating Contact Page | ${contactPageURL}`);
            /* Evaluate the contact's name */
            try {
                let name = await page.evaluate(() => {
                    let licenseeNameSelector = 'body > div.w3-content.w3-container.w3-padding-64 > h1';
                    let result = document.querySelector(licenseeNameSelector);
                    $(result).remove(); // Remove the name from the page to allow easier navigation of remaining elements
                    var count = (result.innerHTML.match(/<br>/g) || []).length;
                    console.log(`Count: ${count}`);
                    if(count > 1) {

                        let splitName = result.innerHTML.trim().split("<br>");
                        console.log(`${splitName[0]} | ${splitName[1]}`);
                        return splitName[0] + " | " + splitName[1];
                    }
                    return result.innerText.trim();
                });

                console.log(`\nName: ${name}`);
            } catch (error){
                console.log(error);
            }
            /* Evaluate the contact's address */
            try {
                let website = "";
                let phone = "";
                let address = await page.evaluate(() => {
                    let addressSelector = "body > div.w3-content.w3-container.w3-padding-64";
                    let addressReponseRaw = (document.querySelector(addressSelector).innerHTML).toString();    // Save the raw response to be formatted
                    addressReponseRaw = addressReponseRaw.substring(0,addressReponseRaw.indexOf("<table"));
                    while(addressReponseRaw.indexOf("\n") > -1){
                        addressReponseRaw = addressReponseRaw.replace("\n",""); // Remove table data from the address innerText
                    }
                    /* Format web address to remove <a href> tags */
                    if (addressReponseRaw.indexOf("(Web)") > -1) {
                        website = addressReponseRaw.substring((addressReponseRaw.indexOf("<a href=\"") + 9), addressReponseRaw.indexOf("\" target="));
                        console.log(`Website prior: ${website}`);
                        addressReponseRaw = addressReponseRaw.substring(0,addressReponseRaw.indexOf("<a href=") );
                    }
                    /* Split the address/website/phone into an array for processing */
                    console.log(`Response Object RAW: ${addressReponseRaw}`);
                    let responseObj = addressReponseRaw.split("<br>");
                    let finalObj = [];
                    console.log(`\nResponse Obj: ${responseObj}`);
                    /* Loop through the array filtering & removing empty elements */
                    for (let elem in responseObj) {
                        elem = responseObj[elem].toString();
                        if (elem.indexOf("(Phone)") > -1){
                            elem = elem.replace("(Phone)", "");
                            phone = elem.replace("(","").replace(")","").replace("/-/g",""); // Remove parentheses and dashes from phone number
                        } else if (elem !== ""){
                            finalObj.push(elem);
                        }

                    }
                    finalObj.push("United States");
                    console.log(finalObj)
                    return finalObj.join("\n"); // Split the address into lines
                });

                if (website != "") {
                    console.log(`Website: ${website}`);
                }
                if (phone != "") {
                    console.log(`Phone: ${phone}`);
                }
                console.log(`Address: ${address}`);
            } catch(error){
                console.log(error);
            }
        }
    });

    /* Queue each URL for Tasking */
    for(let url of urls) {
        await cluster.queue(url); // Queue each url
    }

    /* Wait for all tasks to finish */
    await cluster.idle();
    /* Close the Cluster */
    await cluster.close();
})();