
/*
USEFUL LINKS
============
https://medium.com/@rishabhpriyadarshi/web-scrapping-with-puppeteer-some-basic-examples-7b20524b6a93/
https://www.fflregistry.com/
 */

const CONFIG = require('./config.json');    // json file containing lengthy data such as CSS selectors, save paths, and URLs.
const STATES_FILE = require('./states.json');   // json file containing all the state's abbreviations and names.
const puppeteer = require('puppeteer'); // Use puppeteer to scrape the FFL Registry contact links before queuing the cluster tasks. Done to isolate cluster.task and remove for loop inside of cluster.task
const decode = require('html-entities-decoder');    // Use html-entities-decoder to decode the HTML entities in the text.
const {Cluster} = require('puppeteer-cluster');     // Use puppeteer-cluster for concurrent operations
/* Create a CsvWriter object to save the results to a CSV file. */
const csvWriter = require('csv-writer').createObjectCsvWriter({
    path: CONFIG.savePath,
    header: [{
        id: 'name',
        title: 'Licensee'
    },
    {
        id: 'company',
        title: 'Company'
    },
    {
        id: 'type',
        title: 'FFL Type'
    },
    {
        id: 'website',
        title: 'Website'
    },
    {
        id: 'phone',
        title: 'Primary Phone'
    },
    {
        id: 'alternatePhone',
        title: 'Alternate Phone'
    },
    {
        id: 'fax',
        title: 'Fax'
    },
    {
        id: 'street',
        title: 'Street'
    },
    {
        id: 'city',
        title: 'City'
    },
    {
        id: 'state',
        title: 'State'
    },
    {
        id: 'zip',
        title: 'Zip'
    },
    {
        id: 'country',
        title: 'Country'
    },
    {
        id: 'expiration',
        title: 'License Expires'
    },
    {
        id: 'licenseNumber',
        title: 'FFL License Number'
    }
    ]
});
/* Save the timestamp of the start of the program. */
const startTime = new Date();
/* Create new progress bar */
const cliProgress = require('cli-progress');
const colors = require('ansi-colors');
const b1 = new cliProgress.SingleBar({
    format: 'CLI Progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Clients || {minutes}m {seconds}s elapsed',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true,
    fps: 40
});

/* Convert State List to URL List */
var urls = [];  // Declare array for urls
for(let state of STATES_FILE.states) {
    urls.push(CONFIG.siteDetails.pageURL + state);  // Add url for each state to array
}
/* Keep track of totalContacts with valid URL*/
var totalContacts = 0;

/* Array of completed contact objects ready to be saved */
const completedContacts = [];

/**
 * Main Asynchronous Function (Driver Function)
 */
(async () => {
    /* Create Cluster */
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 6,
        puppeteerOptions: CONFIG.chromeOptions,
    });

    /* Define a Cluster Task */
    await cluster.task(async ({ page, data: url }) => {
        /* Display browser's console within program console */
        page.on('console', async (msg) => {
            const msgArgs = msg.args();
            for (let i = 0; i < msgArgs.length; ++i) {
                console.log(await msgArgs[i].jsonValue());
            }
        });
        /* Retry failed jobs */
        cluster.on('taskerror', (err, data, willRetry) => {
            if (willRetry) {
                console.warn(`Encountered an error while crawling ${data}. ${err.message}\nThis job will be retried`);
            } else {
                console.error(`Failed to crawl ${data}: ${err.message}`);
            }
        });

        /* Declare contact object*/
        let contact = {
            name: "",
            company: "",
            website: "",
            phone: "",
            alternatePhone: "",
            fax: "",
            street: "",
            city: "",
            state: "",
            zip: "",
            country: "",
            type: "",
            expiration: "",
            licenseNumber: ""
        }
        /* Go to each contact page and evaluate it*/
        await page.goto(url);

        /* Evaluate the contact's name */
        try {
            let name = await page.evaluate(() => {
                let licenseeNameSelector = 'body > div.w3-content.w3-container.w3-padding-64 > h1';
                let result = document.querySelector(licenseeNameSelector);
                $(result).remove(); // Remove the name from the page to allow easier navigation of remaining elements

                /* Check to see if they include a personal name as well as a company name */
                var count = (result.innerHTML.match(/<br>/g) || []).length;
                if(count > 1) {
                    /* If they do, return both names */
                    return result.innerHTML.trim().split("<br>");
                }
                /* If they don't, return the company name */
                return [result.innerText.trim()];
            });
            if (name.length > 0) {
                contact.name = decode(name[0]);
                if (typeof name[1] !== 'undefined'){
                    contact.company = decode(name[1]);
                }
            } else{
                contact.name= decode(name[0]);
                contact.company = decode(name[0]);
            }
        } catch (error){
            console.log(error);
        }

        /* Evaluate the contact's address, website, and phone */
        try {
            var addressResponseRaw = await page.evaluate(() => {
                let addressSelector = "body > div.w3-content.w3-container.w3-padding-64";
                return (document.querySelector(addressSelector).innerHTML).toString();    // Save the raw response to be formatted
                });
            } catch(error){
                console.log(error);
            }

        addressResponseRaw = addressResponseRaw.substring(0,addressResponseRaw.indexOf("<table")); // Remove the table from the response to isolate the address
        while(addressResponseRaw.indexOf("\n") > -1){
            addressResponseRaw = addressResponseRaw.replace("\n",""); // Remove new lines from the response
        }

        /* Split the address/website/phone into an array for processing */
        let responseObj = addressResponseRaw.toString().split("<br>");
        let finalObj = [];

        /* Loop through the array filtering & removing empty elements */
        for (let elem in responseObj) {
            elem = responseObj[elem];
            /* Filter out Phone, Alternate Phone, Fax, and Web Address */
            if (elem.indexOf("(Phone)") > -1){
                elem = elem.replace("(Phone)", "");
                contact.phone = elem.replace("(","").replace(")","").replaceAll('-','').replaceAll(' ', '').trim();   // Remove parentheses, dashes, and spaces fromphone number

            } else if(elem.indexOf("(Alternate Phone)") > -1){
                elem = elem.replace("(Alternate Phone)", "");
                contact.alternatePhone = elem.replace("(","").replace(")","").replaceAll('-','').replaceAll(' ', '').trim(); // Remove parentheses, dashes, and spaces from alternate phone

            } else if(elem.indexOf("(Fax)") > -1){
                elem = elem.replace("(Fax)", "");
                contact.fax = elem.replace("(","").replace(")","").replaceAll('-','').replaceAll(' ', '').trim();   // Remove parentheses, dashes, and spaces from Fax number

            } else if (elem.indexOf("(Web)") > -1) {
                contact.website = elem.substring((elem.indexOf("<a href=\"") + 9), elem.indexOf("\" target=")).replace("http://","").replace("https://","").replace("www.","").trim();

            } else if (elem !== '' && elem != null) {
                finalObj.push(elem);
            }
        }
        contact.country = "USA"; // Add contact Country
        /* Format the address */
        if (finalObj.length > 2) {
            contact.street = finalObj[0] + " " + finalObj[1].trim();
            let cityStateZip = parseAddress(finalObj[2]);
            contact.city = decode(cityStateZip.city);
            contact.state = decode(cityStateZip.state);
            contact.zip = decode(cityStateZip.zip);
        } else{
            contact.street = finalObj[0].trim();
            let cityStateZip = parseAddress(finalObj[1]);
            contact.city = decode(cityStateZip.city);
            contact.state = decode(cityStateZip.state);
            contact.zip = decode(cityStateZip.zip);
        }
        /* Evaluate the contact's type */
        try {
            var dealerTypeRaw = await page.evaluate(() => {
                let dealerTypeSelector = "body > div.w3-content.w3-container.w3-padding-64 > table > tbody > tr:nth-child(2) > td:nth-child(2)";
                return (document.querySelector(dealerTypeSelector).innerText).toString();    // Save the raw response to be formatted
            });
        } catch(error){
            console.log(error);
        }
        dealerTypeRaw = dealerTypeRaw.replace("[Preferred]","");
        contact.type = dealerTypeRaw.trim();
        /* Evaluate the contact's FFL number */
        try {
            var FFLnumRaw = await page.evaluate(() => {
                let FFLnumSelector = "body > div.w3-content.w3-container.w3-padding-64 > table > tbody > tr:nth-child(1) > td:nth-child(2)";
                return (document.querySelector(FFLnumSelector).innerText).toString();    // Save the raw response to be formatted
            });
        } catch(error){
            console.log(error);
        }
        FFLnumRaw = FFLnumRaw.replaceAll(" ",""); // Remove spaces from contact's FFL number
        contact.licenseNumber = FFLnumRaw.trim();
        /* Evaluate the contact's FFL expiration */
        try {
            var FFlexpiration = await page.evaluate(() => {
                let FFLexpirationSelector = "body > div.w3-content.w3-container.w3-padding-64 > table > tbody > tr:nth-child(3) > td:nth-child(2)";
                return (document.querySelector(FFLexpirationSelector).innerText).toString();    // Save the raw response to be formatted
            });
        } catch(error){
            console.log(error);
        }
        contact.expiration = FFlexpiration.trim();

        /* Save the contact */
        completedContacts.push(contact);
        await updateBar();
    });

    /* Queue each URL for Tasking using Single instance puppeteer*/
    const browser = await puppeteer.launch() // Wait for single instance of puppeteer to be available
    const page = await browser.newPage()    // Create a new page in single instance puppeteer
    var allContactUrls = []; // URLs for every company to be queued
    for(let url of urls) {
        /* Go to specified URL */
        await page.goto(url);
        /* Wait for page's table to load before evaluating*/
        try {
            await page.waitForSelector(CONFIG.cssSelectors.table, {
                timeout: 10000
            });
        } catch (error) {
            console.log(`\nProblem loading table | ${url} \n ${error}`);
        }
        /* Grab all links to individual pages from table */
        try{
            var contactPageURLs = await page.evaluate(() => {
                let arr = Array.from(document.querySelectorAll('table.x-grid3-row-table > tbody > tr > td.x-grid3-col.x-grid3-cell.x-grid3-td-contact > div > a'));
                return arr.map(a => a.href);
            });
        } catch(error) {
            console.log(error);
        }


        allContactUrls = allContactUrls.concat(contactPageURLs);
        console.log(`Adding ${contactPageURLs.length} contacts | ${allContactUrls.length} |(${urls.indexOf(url) + 1})`);
    }
    await browser.close();  // Close single instance puppeteer

    /* Add each company's URL to cluster.queue */
    for(let url of allContactUrls) {
        await cluster.queue(url);
    }
    totalContacts = allContactUrls.length;
    /* Start the progress bar */
    b1.start(allContactUrls.length, 0, {
        minutes: 0,
        seconds: 0
    });

    /* Cluster.task() will now execute the task function for each URL in the queue */

    /* Wait for all tasks to finish */
    await cluster.idle();
    /* Close the Cluster */
    await cluster.close();

    /* Write the completed contacts to a file */
    await saveCSV(completedContacts);
})();

/**
 * Parse address into city, state, and zip object
 * @param address {string} - Address to parse (City, State Zip)
 * @returns {{}}
 */
function parseAddress(address) {
    // Make sure the address is a string.
    if (typeof address !== "string") throw "Address is not a string.";

    // Trim the address.
    address = address.trim();

    // Make an object to contain the data.
    var returned = {};

    // Find the comma.
    var comma = address.indexOf(',');

    // Pull out the city.
    returned.city = address.slice(0, comma);

    // Get everything after the city.
    var after = address.substring(comma + 2); // The string after the comma, +2 so that we skip the comma and the space.

    // Find the space.
    var space = after.lastIndexOf(' ');

    // Pull out the state.
    returned.state = after.slice(0, space);

    // Pull out the zip code.
    returned.zip = after.substring(space + 1);

    // Return the data.
    return returned;
}

/**
 * Display a contact in formatted output.
 * @param contact   The contact you would like to display.
 */
function displayContact(contact) {
    console.log("\n========================================");
    console.log(`Name: ${contact.name}`);
    console.log(`Company: ${contact.company}`);
    console.log(`Type: ${contact.type}`);
    console.log(`FFL Number: ${contact.licenseNumber}`);
    console.log(`FFL Expiration: ${contact.expiration}`);
    console.log(`Website: ${contact.website}`);
    console.log(`Street: ${contact.street}`);
    console.log(`City: ${contact.city}`);
    console.log(`State: ${contact.state}`);
    console.log(`Zip: ${contact.zip}`);
    console.log(`Country: ${contact.country}`);
    console.log(`Phone: ${contact.phone}`);
    console.log(`Alternate Phone: ${contact.alternatePhone}`);
    console.log(`Fax: ${contact.fax}`);
    console.log("========================================")
}

/**
 * A function to write the result objects to a CSV file.
 * @param results   Array of objects to be converted to CSV.
 */
async function saveCSV(results) {

    b1.stop();  // Stop the progress bar
    let currentTime = new Date();   // Get the current time for elapsed time calculation
    let execution_time_in_seconds = (currentTime - startTime) / 1000;              // Calculate the execution time in seconds
    let execution_time_in_minutes = Math.floor(execution_time_in_seconds / 60); // Calculate the execution time in minutes
    let remainder = Math.round((execution_time_in_seconds % 60) * 100) / 100;   // Calculate the remainder of the execution time in seconds rounded to the nearest hundredth
    console.log("Saving CSV file with " + results.length + " results...");

    csvWriter.writeRecords(results) // returns a promise
        .then(() => {
            console.log(`...Done! CSV File Saved with ${results.length}/${totalContacts} results in ${execution_time_in_minutes} minute(s) and ${remainder} seconds.`);
        });
}

/**
 * A function to update the progress bar after each completed task. Relies on globally defined b1 and startTime
 * @returns {Promise<void>} Returns void.
 */
async function updateBar() {
    console.clear();
    let currentTime = new Date();
    let execution_time_in_seconds = (currentTime - startTime) / 1000;
    let execution_time_in_minutes = Math.floor(execution_time_in_seconds / 60);
    let remainder = execution_time_in_seconds % 60;
    remainder = Math.round(remainder * 100) / 100;
    b1.increment({
        minutes: execution_time_in_minutes,
        seconds: remainder
    });
}