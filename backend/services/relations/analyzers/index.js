// backend/services/relations/analyzers/index.js
const { BaseAnalyzer } = require('./baseAnalyzer');
const { UserCommandAnalyzer } = require('./userCommandAnalyzer');
const { IPAnalyzer } = require('./ipAnalyzer');
const { HostnameAnalyzer } = require('./hostnameAnalyzer');
const { HostnameIPAnalyzer } = require('./hostnameIPAnalyzer');
const { DomainAnalyzer } = require('./domainAnalyzer');
const { FileStatusAnalyzer } = require('./fileStatusAnalyzer');
const { UserHostnameAnalyzer } = require('./userHostnameAnalyzer');
const { UserIPAnalyzer } = require('./userIPAnalyzer');
const { UserMacAnalyzer } = require('./userMacAnalyzer');
const { UserDomainAnalyzer } = require('./userDomainAnalyzer');
const { MacAddressAnalyzer } = require('./macAddressAnalyzer');

module.exports = {
  BaseAnalyzer,
  UserCommandAnalyzer,
  IPAnalyzer,
  HostnameAnalyzer,
  HostnameIPAnalyzer,
  DomainAnalyzer,
  FileStatusAnalyzer,
  UserHostnameAnalyzer,
  UserIPAnalyzer,
  UserMacAnalyzer,
  UserDomainAnalyzer,
  MacAddressAnalyzer
};
