var http = require('http');
var xssec = require('sap-xssec');
var express = require('express');
var passport = require('passport');
var xs_hdb_conn = require('sap-hdb-connection');
var winston = require('winston');
var xsenv = require('sap-xsenv');
var async = require('async');
var fs = require('fs');
var path = require('path');
var glob = require("glob")

var PORT = process.env.PORT || 3000;
var app = express();

//log level
winston.level = process.env.winston_level || 'error';

passport.use('JWT', new xssec.JWTStrategy(xsenv.getServices({uaa:{tag:'xsuaa'}}).uaa));
app.use(passport.initialize());
/*
 * use database connection pool provided by xs_hdb_conn
 * provides a db property containing the connection
 * object to the request object of all routes.
 */
app.use('/',
    passport.authenticate('JWT', {session: false}),
    xs_hdb_conn.middleware());

app.use (function(req, res, next) {
    var data='';
    req.setEncoding('utf8');
    req.on('data', function(chunk) { 
       data += chunk;
    });

    req.on('end', function() {
        req.body = data;
        next();
    });
}); 

//Hello Router
app.route('/hello')
  .get(function(req, res) {
    res.send('Hello World Node.js');
  })

//Get Directories
app.route('/directories/:dir')
  .get(function(req,res){
   var dirInput = req.params.dir;  
   if(dirInput === '*'){
   		dirInput = '/'
   }else{
   	   dirInput = dirInput.replace(/\./g, '/');
   }

   try{
   		var dirs = getDirectories(path.join(__dirname, dirInput));
   		res.type('application/json').status(200).send(JSON.stringify(dirs));
   }
   catch(e){
   		res.type('application/json').status(200).send('[]');
   }

  })

//Get All Files
app.route('/files/:dir/:file')
  .get(function(req,res){
   var dirInput = req.params.dir;  
   if(dirInput === '*'){
   		dirInput = '/'
   }else{
   	   dirInput = dirInput.replace(/\./g, '/');
   }

   var fileInput = req.params.file;
   if(fileInput === '*'){ fileInput = ''};
   var regEx = new RegExp('^'+fileInput+'.')
   try{
   	    var files = getFiles(path.join(__dirname, dirInput),regEx);
    	res.type('application/json').status(200).send(JSON.stringify(files));
    }   
   catch(e){
   		res.type('application/json').status(200).send('[]');
   }    

  })


//Get File Contents
app.route('/file/:dir/:file')
  .get(function(req,res){
   var dirInput = req.params.dir;  
   dirInput = dirInput.replace(/\./g, '/');
   var fileInput = req.params.file;
   try{
    	res.type('application/json').status(200).send(
    		fs.readFileSync(path.join(__dirname, dirInput)+ '/' + fileInput,'utf8') );
    }   
   catch(e){
   		res.type('application/json').status(404).send(e.toString());
   }    

  })

//Get All Workshops
app.route('/workshops')
  .get(function(req, res){
 	var client = req.db;
    client.prepare(
        'select WORKSHOP_ID from "workshop.admin.data::exerciseMaster.workshop" ORDER BY WORKSHOP_ID ', 
        function (err, statement){
            statement.exec([],
                function (err, results) {
                    if (err){
                        res.type('text/plain').status(500).send("ERROR: " + err);
                    }else{
                        result = JSON.stringify( { Objects: results });
                        res.type('application/json').status(200).send(result);
                    }
                }
            )
        }
    );
})

//Get Details of a specific Workshop
app.route('/workshop/:workshopid')
 .get(function(req, res){
 	var workshopID = req.params.workshopid;
    var client = req.db;
    client.prepare(
        'select JSON_DATA from "workshop.admin.data::exerciseMaster.workshop" where WORKSHOP_ID = ?', 
        function (err, statement){
            statement.exec([workshopID],
                function (err, results) {
                    if (err){
                        res.type('text/plain').status(500).send("ERROR: " + err);
                    }else{
                        res.type('application/json').status(200).send(results[0].JSON_DATA);
                    }
                }
            )
        }
    );
})

//Delete a specific Workshop
app.route('/workshop/:workshopid')
 .delete(function(req, res){
 	var workshopID = req.params.workshopid;
    var client = req.db;
    client.prepare(
        'delete from "workshop.admin.data::exerciseMaster.workshop" where WORKSHOP_ID = ?', 
        function (err, statement){
            statement.exec([workshopID],
                function (err, results) {
                    if (err){
                        res.type('text/plain').status(500).send("ERROR: " + err);
                    }else{
                        res.type('text/plain').status(200).send("Sucessful Deletion");
                    }
                }
            )
        }
    );
})

//Update/Insert a workshop
app.route('/workshop/:workshopid')
 .put(function(req, res){
    upsertWorkshop(req,res);
})
app.route('/workshop/:workshopid')
 .post(function(req, res){
    upsertWorkshop(req,res);
})

//Upload Workshop from Client Side
app.route('/workshop/upload')
 .post(function(req, res){
  var filename = req.files.displayImage.name
  var workshopID = filename.substring(0, str.length - 5);
  var JSON_DATA = fs.readFileSync(req.files.displayImage.path,'utf8'); 
  var client = req.db;
  client.prepare(
        'upsert "workshop.admin.data::exerciseMaster.workshop" values(?,?) where WORKSHOP_ID = ?', 
        function (err, statement){
            statement.exec([workshopID, JSON_DATA, workshopID],
                function (err, results) {
                    if (err){
                        res.type('text/plain').status(500).send("ERROR: " + err);
                    }else{
                        res.type('text/plain').status(200).send('Successful Upsert of Workshop');
                    }
                }
            )
        }
    );
})

//Get Details of a specific Workshop
app.route('/workshop/download/:workshopid')
 .get(function(req, res){
  var workshopID = req.params.workshopid;
    var client = req.db;
    client.prepare(
        'select JSON_DATA from "workshop.admin.data::exerciseMaster.workshop" where WORKSHOP_ID = ?', 
        function (err, statement){
            statement.exec([workshopID],
                function (err, results) {
                    if (err){
                        res.type('text/plain').status(500).send("ERROR: " + err);
                    }else{
                        res.setHeader('Content-Disposition','attachment; filename='+workshopID+'.json');
                        res.type('application/json').status(200).send(results[0].JSON_DATA);
                    }
                }
            )
        }
    );
})

// Start the server
var server = app.listen(PORT, function() {
  console.log('Listening on http://localhost:'+ PORT +'/hello');
});

function getDirectories(srcpath) {
  var files = glob.sync(srcpath+'*');
  var i = files.length;
  while( i--){
    if(fs.statSync(files[i]).isFile()){
      files.splice(i,1);
    }else{
      files[i] = files[i].substring(__dirname.length);
      files[i] = files[i].substring(1);
      files[i] = files[i].replace(/\//g, '.');
    }
  }
  return files;
}

function upsertWorkshop(req,res){
  var workshopID = req.params.workshopid;
    var json = req.body;
    console.log(json);
    var client = req.db;
    client.prepare(
        'upsert "workshop.admin.data::exerciseMaster.workshop" values(?,?) where WORKSHOP_ID = ?', 
        function (err, statement){
            statement.exec([workshopID, json, workshopID],
                function (err, results) {
                    if (err){
                        res.type('text/plain').status(500).send("ERROR: " + err);
                    }else{
                        res.type('text/plain').status(200).send('Successful Upsert of Workshop');
                    }
                }
            )
        }
    );
}

function getFiles(srcpath,fileName){
  return fs.readdirSync(srcpath).filter(function(file) {
  	if(fileName.test(file)){
  		    return fs.statSync(path.join(srcpath, file)).isFile();
  	}
    return false;
  });

}