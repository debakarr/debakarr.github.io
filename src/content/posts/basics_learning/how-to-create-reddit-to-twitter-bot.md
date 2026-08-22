---
title: "How to build a reddit to twitter bot"
date: "2017-06-19"
description: "First of all what will be this bot doing actually? Ans. This bot will be tweeting any new post on a particular subreddit to your twitter bot account. In my case it will be tweeting any new tweets from /r/anime Can I have a look on the finished product? Ans. Here you go So what do I actually need to create the bot? Ans. Some Basic Programming knowlegde and how to run terminal."
categories: ["Social Media", "Programming", "Web Development", "Automation"]
tags: ["Reddit", "Twitter", "Bot", "Automation", "API", "Node.js", "JavaScript", "Tutorial", "How-to"]
draft: false
---

**First of all what will be this bot doing actually?**

**Ans.** *This bot will be tweeting any new post on a particular subreddit to your twitter bot account. In my case it will be tweeting any new tweets from **/r/anime***

**Can I have a look on the finished product?**

**Ans.** *[Here you go](https://twitter.com/ranimesubreddit)*

**So what do I actually need to create the bot?**

**Ans.**

-   Some Basic Programming knowlegde and how to run terminal.
-   You will need to install few software.
-   Get the gist of the code to modify it and make your own bot.

So lets begin.

## **Installing node js**

-   First of all go to this [link](https://nodejs.org/en/) and download node js, click the installer depending on your OS.
-   Now run the setup and install it. make sure you did check include PATH.
-   Next open up your terminal and type this code:

```
$ node
```

-   If your ‘$’ symbol change into ‘>’ symbol then you did everything correct upto this point.

## **Creating node package**

Now it time to start code.

First of all go to the folder where you want to make your bot(create your node package). Then click:

```bash
$ npm init
```

Now it will ask you for few information. Here’s an example:

```
name: twitter bot
version: (0.0.0) 1.0.0
description: My package description goes here.
entry point: bot.js
test command:
git repository: 
keywords: bot twitter reddit
author: Debakar Roy
license: (ISC)
```

This will create a json file named package.json. You can edit it as you like in future.

\[NOTE: **What is json?** **Ans.** *JSON, or JavaScript Object Notation, is a minimal, readable format for structuring data. It is used primarily to transmit data between a server and web application, as an alternative to XML.*\]

## **Installing dependecy packages**

Now its time to install few Node Package Manager. You can head up to [npmjs.com](https://www.npmjs.com/) to look up for package you need.

\[NOTE: **What is npm?** **Ans.** *npm makes it easy for JavaScript developers to share and reuse code, and it makes it easy to update the code that you’re sharing. To be honest they are premade packages which let you use different APIs.*\]

Pakages we need:

-   [twit](https://www.npmjs.com/package/twit) \[To talk with twitter.\]
-   [reddit-snooper](https://www.npmjs.com/package/reddit-snooper) \[To talk to reddit.\]
-   [goo.gl](https://www.npmjs.com/package/goo.gl) \[To create short link.\]

To install pakage use this code:

```bash
$ npm install twit --save
$ npm install reddit-snooper --save
$ npm install goo.gl --save
```

It might give you some warning. That’s only because you didn’t fill the package.json files. You dont need to worry about that :).

**I would Highly recommend you to go through the documentation for each node package to get a basic knowlegde on how to use the packages.**

## **Creating bot file**

Now create a file name bot.js and copy up all this code. For simplicity I have provided few comments to make you understand what are the snippets doing.

```javascript
//Bot start message
console.log('Starting bot.');

//nmp modules
var Twit = require('twit');
var Snooper = require('reddit-snooper')
var googl = require('goo.gl');

//Authenticate twitter
var T = new Twit({
  consumer_key:         'Consumer key',
  consumer_secret:      'Consumer Secret',
  access_token:         'Access Token',
  access_token_secret:  'Access Token Secret',
  timeout_ms:           60*1000,  // optional HTTP request timeout to apply to all requests. 
});

//Authenticate reddit
snooper = new Snooper({
			
			// credential information is not needed for snooper.watcher 
            username: 'reddit_username',
            password: 'reddit password',
            app_id: 'reddit api app id',
            api_secret: 'reddit api secret',
            user_agent: 'OPTIONAL user agent for your bot',
 
            automatic_retries: true, // automatically handles condition when reddit says 'you are doing this too much' 
            api_requests_per_minuite: 60 // api requests will be spread out in order to play nicely with Reddit 
        });

googl.setKey('Your Google API key');
googl.getKey();

var tweet_text;

//reddit new post search
snooper.watcher.getPostWatcher('subreddit name') 
    .on('post', function(post) {
		var shortlink = 'www.reddit.com/' + post.data.permalink;
		var shortposturl = post.data.url;
		console.log(shortlink)
		
		//Create short url
		googl.shorten(shortlink)
			.then(function (shortUrl) {
				console.log(shortUrl);
				shortlink = shortUrl;
			})
			.catch(function (err) {
				console.error(err.message);
			});
					
		googl.shorten(shortposturl)
			.then(function (shortUrl) {
				console.log(shortUrl);
				shortposturl = shortUrl;
			})
			.catch(function (err) {
				console.error(err.message);
			});
		
		//Tweet Generator
		var tweet_title = 'Title: ' + (post.data.title);
		if((post.data.title).length>=70){
			tweet_title = 'Title: ' + (post.data.title).substring(0, 70) + '...';
		}
		var tweet_url ='\nUrl: ' + shortposturl;
		var tweet_discuss =  '\nDiscussion: '+ shortlink;
		
		//Tweet
		tweet_text = tweet_title + tweet_discuss + tweet_url ;
		
		//Print tweet to console
		console.log(tweet_text)
		
		tweet_mytext(tweet_text);
    })
    .on('error', console.error)

//Function to post the tweet
function tweet_mytext(tweet_text){
	var tweet = {
			status: tweet_text
	}

	console.log('\n' + tweet)
	T.post('statuses/update', tweet, tweeted);

	function tweeted(err, data, response) {
			if (err) {
				console.log("Didn't tweeted :(.");
			} else {
				console.log("It worked! Tweeted!!");
			}
	}
}
```

## **How to get credential needed for setting up bot**

So there are sevral question you will ask:

**How to obtain consumer\_key, consumer\_secret, and other twitter credentials.**

**Ans.**

-   For this go to [apps.twitter.com](https://apps.twitter.com/). Make sure you are sign in to your twitter bot account. Twitter will not let you create an app until you verified your account.
-   You can use your real phone number or Twilio or any clound communication base SMS service to complete verifying your account.
-   Now click on **Create New App**. Fill up Name, Description and website.Tick **Yes, I have read and agree to the Twitter Developer Agreement**.
-   Go to Keys and Access Tokens and you will find your consumer\_key and consumer\_secret there. To generate access\_token and access\_token\_secret click on **create my access token** under Token Actions.

**How to obtain api\_secret, app\_id, and other reddit credentials.**   **Ans.** *Steps you need to follow are in the node package description:*

-   Create (or log into) a reddit account
-   Navigate to the authorized applications console
-   Select ‘create another app…’ at the bottom
-   Fill in the name, description and click on ‘script’, put in anything for the redirect uri, its not needed and you can change it later if you want to
-   Copy down the ‘secret’ that is your apisecret, the 14 character string by the name of your app is your appid
-   Use these values and your credentials to configure the snooper

**Now how to obtain the Google API key.**

**Ans.**

-   Visit [https://console.developers.google.com/cloud-resource-manager](https://console.developers.google.com/cloud-resource-manager) and create a new project
-   Search and turn on URL Shortener API
-   Go to Credential on left hand side click on create credential and API key. That’s is your Api key.

Pasting all this credentials in bot.js will let you use the bot.

Now head to the terminal and type:

```bash
$ node bot.js
```

## **Conclusion**

Congratualation you just made a bot which let you fecth any new post from a particular subreddit and tweet it using you twitter bot account.

**NOTE: Please Follow twitter, google and reddit rules to ensure not getting ban. This post is only meant for educational purpose. I will not be take any blame if you get offended in any way.**

Next Tutorial wil be how to host htis bot in Heroku. So that you can let it run even after you turned off your computer. Untill then Stay well and Thank you for reading.
