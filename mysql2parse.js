// mysql2parse
// interactive command-line application for migrating a mysql database to the Parse cloud
//
// 1/18/2013 - starting.

var clc = require('cli-color'),
    u = require('underscore'),
    program = require('commander'),
    mysql = require('mysql');
    

program
.version('0.1')
.option('-h, --host [value]')
.option('-l, --login [value]', 'MySQL login name')
.option('-p, --pass [value]', 'MySQL password')
.option('-d, --database [value]', 'MySQL database name')
.option('-ai, --appid [value]', 'Parse Application ID')
.option('-mk, --masterkey [value]', 'Parse Application Master Key')
.parse(process.argv);

var mysqlConnection;
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
var fieldCache = {};

var tablesCompleted = [];

console.log('\n' + clc.blueBright('===== mysql2parse =====') + '\n');
console.log(clc.greenBright('Migration tool for moving to the Parse Cloud.') + '\n');

checkVariables();



function checkVariables() {
    
    if (!mysqlHost) return program.prompt("Please enter the MySQL host address: ", function(response) { mysqlHost = response; checkVariables(); });
    if (!mysqlLogin) return program.prompt("Please enter the MySQL user login: ", function(response) { mysqlLogin = response; checkVariables(); });
    if (!mysqlPass) return program.prompt("Please enter the MySQL password: ", function(response) { mysqlPass = response; checkVariables(); });
    if (!mysqlDatabase) return program.prompt('Please enter the MySQL Database name: ', function(response) { mysqlDatabase = response; checkVariables(); });
    if (!appId) return program.prompt('Please enter the Parse application Id: ', function(response) { appId = response; checkVariables(); });
    if (!masterKey) return program.prompt('Please enter the Parse application Master Key: ', function(response) { masterKey = response; checkVariables(); });

    showConfirm(testMysqlConnection, exitSafe);
}


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

function exitSafe() { 
    
    console.log(clc.yellow('Application exiting without error.'));
    process.exit();
    
}

function exitError(err) { 
    console.log('\n' + clc.red('Fatal error occured during the process.') + '\n');
    console.log(err);
    process.exit(20);
}

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


function enterRelationsLoop() {

    console.log('\n' + clc.blueBright('=== Configure Relations ===') + '\n');
    
    if (tableRelations.length) {
        u.each(tableRelations, function(relation) { 
           console.log('Table ' + clc.greenBright(relation.source) + ' is related to ' + clc.greenBright(relation.target) + ' via the ' + clc.greenBright(relation.field) + ' column.'); 
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
       startMigration();
    });
        
}

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
                       tableRelations.push({
                          source:sourceTable,
                          target:destTable,
                          field:destField
                       });   
                       if (u.indexOf(tableDependencies[destTable],sourceTable) == -1) tableDependencies[destTable].push(sourceTable);
                   }
                   enterRelationsLoop();
                });
               } else enterRelationsLoop();
           })
       } else enterRelationsLoop();
    });
    
}

function startMigration() { 
    
    // not done yet, stopping for the night.
    exitSafe();
    
    while (tablesCompleted.length < tables.length) {
        
        u.each(tables, function(table) { 
           
           if (u.indexOf(tablesCompleted, table) == -1) {
               
               if (!tableHasRelation(table)) {
                   
               } else {
                   
               }
               
           }
            
        });        
        
    }
    
    exitSafe();
    
}

function listTables() {
    console.log('\n' + clc.yellowBright('Table listing:'));
    u.each(tables, function(table, idx) {
        console.log(clc.blueBright(idx) + ':  ' + clc.greenBright(table));
    });
    console.log('\n');
}

function listColumns(table) { 
    if (columns[table]) {
        console.log('\n' + clc.yellowBright('Table listing:'));
        u.each(columns[table], function(col, idx) { 
           console.log(clc.blueBright(idx) + ':  ' + clc.greenBright(col)); 
        });
    }
}