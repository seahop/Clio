// relation-service/src/services/analyzers/index.js
const { BaseAnalyzer } = require('./baseAnalyzer');
const { UserCommandAnalyzer } = require('./userCommandAnalyzer');
const { IPAnalyzer } = require('./ipAnalyzer');
const { HostnameAnalyzer } = require('./hostnameAnalyzer');
const { DomainAnalyzer } = require('./domainAnalyzer');
const { FileStatusAnalyzer } = require('./fileStatusAnalyzer');
const { UserHostnameAnalyzer } = require('./userHostnameAnalyzer');
const { UserIPAnalyzer } = require('./userIPAnalyzer');

module.exports = {
  BaseAnalyzer,
  UserCommandAnalyzer,
  IPAnalyzer,
  HostnameAnalyzer,
  DomainAnalyzer,
  FileStatusAnalyzer,
  UserHostnameAnalyzer,
  UserIPAnalyzer
};