// mysql2parse
// interactive command-line application for migrating a mysql database to the Parse cloud
//
// 1/18/2013 - starting.

var clc = require('cli-color'),
    u = require('underscore'),
    program = require('commander');
    

program
.version('0.1')
.option('-l, --login []', 'MySQL login name')
.option('-p, --pass', 'MySQL password')
.option('-d, --database', 'MySQL database name')
.option('-ai, --appid', 'Parse Application ID')
.option('-mk, --masterkey', 'Parse Application Master Key')
.parse(process.argv);

var mysqlLogin = program.login ? program.login : '';
var mysqlPass = program.pass ? program.pass : '';
var mysqlDatabase = program.database ? program.database : '';
var appId = program.appid ? program.appid : '';
var masterKey = program.masterkey ? program.masterkey : '';

