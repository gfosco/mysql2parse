// mysql2parse
// interactive command-line application for migrating a mysql database to the Parse cloud
//
// 1/18/2013 - Starting.
// 1/19/2013 - Works for simple example database.
// 1/19/2013 - Adding some comments.  Reviewing what I wrote.. the standard 'What was I thinking?'

var clc = require('cli-color'),
    u = require('underscore'),
    program = require('commander'),
    mysql = require('mysql'),
    Parse = require('node-parse-api').Parse;
    

program
  .version('0.1')
  .option('-h, --host [value]', 'MySQL host address')
  .option('-l, --login [value]', 'MySQL login name')
  .option('-p, --pass [value]', 'MySQL password')
  .option('-d, --database [value]', 'MySQL database name')
  .option('-a, --appid [value]', 'Parse Application ID')
  .option('-m, --masterkey [value]', 'Parse Application Master Key')
  .parse(process.argv);

var mysqlConnection;
var parseApp;

// initialize the parameters and populate them from the command line options
var mysqlHost = program.host ? program.host : '';
var mysqlLogin = program.login ? program.login : '';
var mysqlPass = program.pass ? program.pass : '';
var mysqlDatabase = program.database ? program.database : '';
var appId = program.appid ? program.appid : '';
var masterKey = program.masterkey ? program.masterkey : '';


var tables = [];
var columns = {};
var tableRelations = [];
var tableDependencies = {};
var fieldsToCache = {};
var fieldCache = {};
// the migrating variable is used like a mutex flag
var migrating = 0;

var tablesCompleted = [];

console.log('\n' + clc.blueBright('===== mysql2parse =====') + '\n');
console.log(clc.greenBright('Migration tool for moving to the Parse Cloud.') + '\n');


checkVariables();
// main program flow ends here.


// /functions/

// this function will keep executing until all required fields are provided
// before moving on to the next step
function checkVariables() {
    
    if (!mysqlHost) return program.prompt("Please enter the MySQL host address: ", function(response) { mysqlHost = response; checkVariables(); });
    if (!mysqlLogin) return program.prompt("Please enter the MySQL user login: ", function(response) { mysqlLogin = response; checkVariables(); });
    if (!mysqlPass) return program.prompt("Please enter the MySQL password: ", function(response) { mysqlPass = response; checkVariables(); });
    if (!mysqlDatabase) return program.prompt('Please enter the MySQL Database name: ', function(response) { mysqlDatabase = response; checkVariables(); });
    if (!appId) return program.prompt('Please enter the Parse application Id: ', function(response) { appId = response; checkVariables(); });
    if (!masterKey) return program.prompt('Please enter the Parse application Master Key: ', function(response) { masterKey = response; checkVariables(); });

    parseApp = new Parse(appId,masterKey);
    showConfirm(testMysqlConnection, exitSafe);
}

// display the current settings and give the user a chance to abort.
function showConfirm(success, error) { 
    
    console.log('\n' + clc.yellowBright('===== Review Current Settings =====') + '\n');
    console.log('\n' + clc.greenBright('MySQL Host: ') + mysqlHost);
    console.log(clc.greenBright('MySQL Username: ') + mysqlLogin);
    console.log(clc.greenBright('MySQL Password: ') + '*******');
    console.log(clc.greenBright('MySQL Database: ') + mysqlDatabase);
    console.log(clc.greenBright('Parse Application ID: ') + appId);
    console.log(clc.greenBright('Parse Master Key: ') + masterKey);    
    
    program.confirm('\n\n' + clc.yellowBright('Do you want to continue with the migration? ') + ' ', function (ok) { 
       if (ok) return success(); 
       return error();
    });
    
}

// make sure the MySQL credentials work before moving on.
function testMysqlConnection() { 
  
    mysqlConnection = mysql.createConnection({
        host:mysqlHost,
        user:mysqlLogin,
        password:mysqlPass,
        database:mysqlDatabase
    });
    
    mysqlConnection.connect(function (err) {
       if (err) {
            console.log('\n' + clc.red('MySQL Settings Failed.') + '\n');
            mysqlHost = mysqlLogin = mysqlPass = mysqlDatabase = '';
            checkVariables();
       } else {
           console.log('\n' + clc.green('MySQL Settings Tested Successfully.') + '\n');
           getMySQLTables();
       }
    });
    
}

// Don't exit if the migration is still in process.
function exitSafe() { 
    
    if (migrating) return setTimeout(exitSafe,1000);
    console.log(clc.yellow('Application exiting without error.'));
    process.exit();
    
}

// Basic fatal error handler, prints the message and terminates the process.
function exitError(err) { 
    console.log('\n' + clc.red('Fatal error occured during the process.') + '\n');
    console.log(err);
    process.exit(20);
}

// Query MySQL, store all of the tables you find.
function getMySQLTables() {
    
    mysqlConnection.query('show tables', function (err, rows) { 
        if (err) return exitError(err);
        u.each(rows, function(row) { 
           tables.push(row['Tables_in_' + mysqlDatabase]); 
        });
        console.log('\n' + clc.greenBright('Loaded ') + clc.blueBright(tables.length) + clc.greenBright(' tables.') + '\n');
        getMySQLColumns();
    });
       
}

// Query and store the columns for all tables.
function getMySQLColumns() {

    console.log('\n' + clc.greenBright('Loading columns for tables...') + '\n'); 
    
    u.each(tables, function(table) { 
        if (!tableDependencies[table]) tableDependencies[table] = [];
        mysqlConnection.query('describe ' + table, function (err, rows) { 
           if (err) return exitError(err);
           if (!columns[table]) columns[table] = [];
           u.each(rows, function(row) { 
              columns[table].push(row['Field']);
           });
        });
    });

    console.log('\n' + clc.greenBright('Finished loading columns.') + '\n');
    enterRelationsLoop();
    
}

// Displays the current relations list and gives the user an option to create a relation.
// Will be executed repeatedly until the user chooses not to add a relation.
function enterRelationsLoop() {

    console.log('\n' + clc.blueBright('=== Configure Relations ===') + '\n');
    
    if (tableRelations.length) {
        u.each(tableRelations, function(relation) { 
           console.log('Relation exists from ' + clc.greenBright(relation.source) + '.' + clc.greenBright(relation.sourceField) + ' to ' + clc.greenBright(relation.target) + '.' + clc.greenBright(relation.targetField)); 
        });        
        console.log('\n');
        u.each(tables, function(table) {
           if (tableDependencies[table]) {
               u.each(tableDependencies[table], function(dep) {
                   console.log('Table ' + clc.greenBright(table) + ' is dependent on ' + clc.greenBright(dep));
               })               
           } 
        });
        console.log('\n');
    } else {
        console.log(clc.yellowBright('No relations configured.') + '\n');
    }

    program.confirm('Would you like to add a relation? ', function(ok) { 
       if (ok) return startAddRelation();
       // Give the user a chance to cancel the process.
       program.confirm('\n\n' + clc.yellowBright('The migration is ready to begin.  Continue?') + ' ', function(ok) { 
          if (ok) {
              startMigration();
          } else exitSafe();
       });
    });
        
}

// Asks the user to define the parent table, child table, child field, and parent field
// Then stores that in various sub-optimal ways for use in the migration later.
function startAddRelation() { 

    listTables();
    program.prompt('Which table # is the Parent/Source? ', Number, function(source) { 
       if (source >= 0 && source < tables.length) {
           var sourceTable = tables[source];
           listTables();
           program.prompt('Which table # is the Child/Destination? ', Number, function(dest) { 
               if (dest >= 0 && dest < tables.length) {
                var destTable = tables[dest];
                if (destTable == sourceTable) return enterRelationsLoop();
                listColumns(destTable);
                program.prompt('Which column # refers to the Parent? ', Number, function(field) { 
                   if (field >= 0 && field < columns[destTable].length) {
                       var destField = columns[destTable][field];
                       listColumns(sourceTable);
                       program.prompt('Which column # identified this Parent object? ', Number, function(field) { 
                            if (field >= 0 && field < columns[sourceTable].length) {
                                var sourceField = columns[sourceTable][field];
                                tableRelations.push({
                                    source:sourceTable,
                                    target:destTable,
                                    targetField:destField,
                                    sourceField:sourceField
                                });   
                                if (u.indexOf(tableDependencies[destTable],sourceTable) == -1) tableDependencies[destTable].push(sourceTable);
                                if (!fieldsToCache[sourceTable]) fieldsToCache[sourceTable] = {};
                                fieldsToCache[sourceTable][sourceField] = 1;
                                if (!fieldCache[sourceTable]) fieldCache[sourceTable] = {};
                                if (!fieldCache[sourceTable][sourceField]) fieldCache[sourceTable][sourceField] = {};
                            }
                            enterRelationsLoop(); 
                       });
                   } else enterRelationsLoop();                   
                });
               } else enterRelationsLoop();
           })
       } else enterRelationsLoop();
    });
    
}

// If there are no relations, this function will theoretically only run once to complete all of the tables.
// If there are relations, this function will run repeatedly.
// It's quite possible/likely it will run many times regardless, and could be written many different ways
//    ex. sort the array, weighted by dependencies; a different async/await pattern; etc.
// Each pass will find more tables available to load.  (parent tables in a relationship must be completed
//   before the child table can be migrated)
// This needs work.
function startMigration() { 
    
    u.each(tables, function(table) { 
       
       if (u.indexOf(tablesCompleted, table) == -1) {
           
           if (tableDependencies[table] && tableDependencies[table].length) {
               var canDo = 1;
               u.each(tableDependencies[table], function(dep) { 
                  if (u.indexOf(tablesCompleted,dep) == -1) canDo = 0; 
               });
               if (canDo) {
                   migrateTable(table);
               }
           } else {
               migrateTable(table);
           }
           
       }
        
    });        

    // If the process isn't done after this first pass, start another round in a second.        
    if (tablesCompleted.length < tables.length) {
        setTimeout(startMigration,1000);    
    } else {
        exitSafe();    
    }
    
}

function listTables() {
    console.log('\n' + clc.yellowBright('Table listing:'));
    u.each(tables, function(table, idx) {
        console.log(clc.greenBright(idx) + ':  ' + clc.greenBright(table));
    });
    console.log('\n');
}

function listColumns(table) { 
    if (columns[table]) {
        console.log('\n' + clc.yellowBright('Column listing for ') + clc.greenBright(table) + ':');
        u.each(columns[table], function(col, idx) { 
           console.log(clc.greenBright(idx) + ':  ' + clc.greenBright(col)); 
        });
    }
}

// Uses the migrating variable so one entire migration is allowed to complete before another one begins.
// Continues incrementing the migrating mutex for each row processed, decrementing it on completion.
// This will use the fieldCache to replace child fields with Parse Pointer objects to the parent record.
function migrateTable(table) { 
    
    if (migrating) return;
    migrating = 1;
    
    console.log('Migrating table ' + clc.greenBright(table));
    mysqlConnection.query('select * from ' + table, function(err, rows) {
       if (err) return exitError(err);
       u.each(rows, function(row) {
           
           migrating++;
           
           (function() {
           
               var obj = row;
               if (obj.id) {
                   obj['oldId'] = obj.id;
                   delete obj.id;
               }
               
               if (tableDependencies[table] && tableDependencies[table].length > 0) { 
                   u.each(tableRelations, function(relation) {
                      if (relation.target == table) {
                          var pointer = {"__type":"Pointer","className":relation.source,"objectId":fieldCache[relation.source][relation.sourceField][row[relation.targetField]]};
                          obj[relation.targetField] = pointer;
                      } 
                   });
               }
               
               parseApp.insert(table, obj, function(err, res) {
                  migrating--;
                  if (err) exitError(err); 
                  if (fieldsToCache[table]) {
                      for (var n in fieldsToCache[table]) {
                          fieldCache[table][n][row[n == 'id' ? 'oldId' : n]] = res.objectId;
                      }
                  }
               });
               
           })();
           
       }); 
       console.log(clc.greenBright('Migrated ' + rows.length + ' objects.'));      
       tablesCompleted.push(table);
       migrating--;
    });
    
}