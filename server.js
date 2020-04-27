
var express = require("express");
var app = express();
var cfenv = require("cfenv");
var bodyParser = require('body-parser');
var speakeasy = require('speakeasy');

var randomstring = require("randomstring");

 var UserDialog = [];
 var bestVendor;

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));

// parse application/json
app.use(bodyParser.json());

var cloudant, mydb;


app.post("/test", function (request, response) {

    console.log("Current state of the server:");
    console.log(JSON.stringify(state));
    response.send(state);
    response.end();
    return;   
});


var authenticate2FA = function(userID, token2FA, callback){
    //save the 2fa code provided by user
    
    console.log("User passed token/password is :" + token2FA);
    var msg;
    var userToken = token2FA;
    var secretKey;
    
    //note: for totp.verify to work, convert any lower case letters to upper case.
    //otherwise it will not work.
    secretKey = 'ABCDEFGHIJKLMNOP';
    
    // Verify that the user token matches what it should at this moment
    var verified = speakeasy.totp.verify({
    secret: secretKey,
    encoding: 'base32',
    token: userToken,
    algorithm: 'sha1'
    });

    console.log("verified flag: " + verified + "for secret key:" + secretKey );

    if(verified) {
      console.log("2FA verified successfully...");
      callback(null);
    } else {
      //return error to the caller
      msg = "2FA verification failed for user: " + userID;
      console.log(msg);
      callback(msg);
    }
}

var defaultResponse = {
  replies: [  
    {
      "type": "text",
      "delay": 1,
      "content": "Authorization ok!",
    },    
  ], 
  conversation: {
    memory: { key: 'value' }
  }
};

//The authentication process: client side
//---------------------------
//client calls the endpoint auth2fa
//this endpoint receives the userID and 2FA token from request payload
//it then checks the 2FA authentication
//if the 2FA authentication passes, it sets certain fields in memory of conversation
//client program needs to check this memory variable every time before performing any action 
app.post("/auth2fa", function (request, response) {

  var UserSessionDetails = { usersession : {

    userid : "",
    userisloggedin : false,
    sessionid : "",
    role : "",
    expireTmsp : "" 

}};


var requestBody = request.body;

console.log("#####WEBHOOK Request Received:");
//console.log(request);
console.log("#####WEBHOOK Request Received: main body is:");
console.log(JSON.stringify(request.body));

//Extract userID and secret from the request parmeters passed.
var param=request.body;
var payloadMemory = param.conversation.memory; 

//check if the user session fields in memory are defined. if they are defined that means the authentication has been done
//then check for the sessionID and match with the userID, if match happens, return a true, else return a false
//Note: the usersession variable to be used should be a local variable

if ( typeof payloadMemory.loggedinuserid.raw !== 'undefined' ) {
  var userID = payloadMemory.loggedinuserid.raw;
}

if (typeof payloadMemory.user2fatoken.raw !== 'undefined' ) {
  var secret = payloadMemory.user2fatoken.raw;
}

//2fa bypass BEGIN
        /*defaultResponse.replies[0].content = "Authorization ok!"      
        payloadMemory.userid = userID
        payloadMemory.userisloggedin = true
        payloadMemory.sessionid = randomstring.generate(20);
        payloadMemory.role = userID
        payloadMemory.expireTmsp = Math.floor(Date.now() / 1000) + 180; //set timestamp expiry to 3 minutes
        
        defaultResponse.conversation.memory = payloadMemory;
        
        console.log("response memory after update");
        console.log(JSON.stringify(defaultResponse.conversation.memory));
        
        response.send(defaultResponse);

        response.end();
        return;*/
//2fa bypass END


authenticate2FA(userID, secret, function(err){
//error
      if (err != null) {
        console.log(err);
        defaultResponse.replies[0].content = "Authorization failed!"      
        payloadMemory.userid = userID
        payloadMemory.userisloggedin = false
        payloadMemory.sessionid = ""
        payloadMemory.role = ""
        payloadMemory.expireTmsp = ""
        defaultResponse.conversation.memory = payloadMemory;

        response.send(defaultResponse);        
        response.end();     
        return;
      } 

//SUCCESS
        //update memory
        //1) generate sessionID. this will be used for subesquent calls to verify whether the user is already logged in or not.
        //2) populate sessionID in memory along with other fields
        defaultResponse.replies[0].content = "Authorization ok!"      
        payloadMemory.userid = userID
        payloadMemory.userisloggedin = true
        payloadMemory.sessionid = randomstring.generate(20);
        payloadMemory.role = userID
        payloadMemory.expireTmsp = Math.floor(Date.now() / 1000) + 180; //set timestamp expiry to 3 minutes
        
        defaultResponse.conversation.memory = payloadMemory;
        
        console.log("response memory after update");
        console.log(JSON.stringify(defaultResponse.conversation.memory));
        
        response.send(defaultResponse);

        response.end();
        return;
});

return;

});





/* * * * * * * * * * * * * * * /
/* H O U S E K E E P I N G    */
/* * * * * * * * * * * * * * * /


/* Endpoint to greet and add a new visitor to database.
* Send a POST request to localhost:3000/api/visitors with body
* {
* 	"name": "Bob"
* }
*/
app.post("/api/visitors", function (request, response) {
  var userName = request.body.name;
  var doc = { "name" : userName };
  if(!mydb) {
    console.log("No database.");
    response.send(doc);
    return;
  }
  // insert the username as a document
  mydb.insert(doc, function(err, body, header) {
    if (err) {
      console.log('[mydb.insert] ', err.message);
      response.send("Error");
      return;
    }
    doc._id = body.id;
    response.send(doc);
  });
});




/**
 * Endpoint to get a JSON array of all the visitors in the database
 * REST API example:
 * <code>
 * GET http://localhost:3000/api/visitors
 * </code>
 *
 * Response:
 * [ "Bob", "Jane" ]
 * @return An array of all the visitor names
 */
app.get("/api/visitors", function (request, response) {
  var names = [];
  if(!mydb) {
    response.json(names);
    return;
  }

  mydb.list({ include_docs: true }, function(err, body) {
    if (!err) {
      body.rows.forEach(function(row) {
        if(row.doc.name)
          names.push(row.doc.name);
      });
      response.json(names);
    }
  });
});


// load local VCAP configuration  and service credentials
var vcapLocal;
try {
  vcapLocal = require('./vcap-local.json');
  console.log("Loaded local VCAP", vcapLocal);
} catch (e) { }

const appEnvOpts = vcapLocal ? { vcap: vcapLocal} : {}

const appEnv = cfenv.getAppEnv(appEnvOpts);

// Load the Cloudant library.
var Cloudant = require('@cloudant/cloudant');
if (appEnv.services['cloudantNoSQLDB'] || appEnv.getService(/cloudant/)) {

  // Initialize database with credentials
  if (appEnv.services['cloudantNoSQLDB']) {
    // CF service named 'cloudantNoSQLDB'
    cloudant = Cloudant(appEnv.services['cloudantNoSQLDB'][0].credentials);
  } else {
     // user-provided service with 'cloudant' in its name
     cloudant = Cloudant(appEnv.getService(/cloudant/).credentials);
  }
} else if (process.env.CLOUDANT_URL){
  cloudant = Cloudant(process.env.CLOUDANT_URL);
}
if(cloudant) {
  //database name
  var dbName = 'mydb';

  // Create a new "mydb" database.
  cloudant.db.create(dbName, function(err, data) {
    if(!err) //err if database doesn't already exists
      console.log("Created database: " + dbName);
  });

  // Specify the database we are going to use (mydb)...
  mydb = cloudant.db.use(dbName);
}

//serve static file (index.html, images, css)
app.use(express.static(__dirname + '/views'));

process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

var port = process.env.PORT || 8080
app.listen(port, function() {
    console.log("To view your app, open this link in your browser: http://localhost:" + port);
});
