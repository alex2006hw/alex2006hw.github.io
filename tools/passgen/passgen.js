
var express = require('express'),
	http = require('http'),
	async = require('async'),
	crypto = require('crypto'),
	fs = require('fs'),
	path = require('path');



var app = express();
var server = require('http').createServer(app);

var symbols = ['!','@','#','$','%','&','*'],
	numbers = ['0','1','2','3','4','5','6','7','8','9'],
	upper   = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
	lower   = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z'];

var chars = [].concat(symbols,numbers,lower,upper);
var words = [];

var crypto_random_number_range = function (n, cb) {
  //result is a number from 0 a n-1
  //Javascript works with 32 bits for bitwise operations but these are signed (2-complement), so it is good to limit the size of n
  if (n <= 0 || n > 2147483647) {
    return cb("n must be larger than 0 and smaller than 2147483647", null);
  }
  var bits, val;
  async.doWhilst(
    function (cb2) {
      crypto.randomBytes(4, function (err, rbytes) {
        if (err) {
          return cb2(err);
        }
        bits = ((rbytes[3] & 0x7f) << 24) + 
          (rbytes[2] << 16) + (rbytes[1] << 8) + rbytes[0];
        val = bits % n;
        cb2();
      });
    }, function () {
      return (bits - val + (n-1)) < 0;
    }, function (err) {
      if (err) {
        return cb(err, null);
      }
      return cb(null, val);
    }
  );
}

var createWordPassword = function (num, minTypes, cb) {
	var separators = ['!','@','#','$','%','&','*','1','2','3','4','5','6','7','8','9'];
	var word, password;
	var wordCount;

	async.doWhilst(
		function (cb2) {
			password = "";
			wordCount = 0;
			async.doWhilst(
				function (cb3) {
					crypto_random_number_range(words.length, function(err, val) {
						if (err == null) {
							word = words[val];

						    crypto_random_number_range(2, function(err, val) {
						    	if (err == null) {

						    		// Randomly capitalize the first letter of words
							    	if (val == 0) {
							    		word = word.charAt(0).toUpperCase() + word.slice(1);
							    	} 

									if (password != null && password.length > 0) {
										crypto_random_number_range(separators.length, function(err, val) {
								    		if (err == null) {
										    	password += separators[val] + word;
										    	wordCount++;
										    	cb3();
									    	} else {
									    		cb3(err);
									    	}
								    	});
									} else {
										password = word;
										wordCount++;
										cb3();
									}
						    	} else {
								    cb3(err);
						    	}
						    });
						} else {
							cb3(err);
						}
				    });

				}, function () {
					return (wordCount < num);
				}, function (err) {
					if (err == null) {
						return cb2();
					} else {
						return cb2(err);
					}
				}
		    );
		}, function () {
			var typeCount = 0;

			if (symbols.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			if (numbers.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			if (upper.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			if (lower.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			return typeCount < minTypes;
		}, function (err) {
			if (err == null) {
				return cb(null, password);
			} else {
				return cb(err, null);
			}
		}
	);
}
var createRandomPassword = function (len, minTypes, cb) {
	var password;

	async.doWhilst(
		function (cb2) {
			password = "";
			async.doWhilst(
			    function (cb3) {
			    	crypto_random_number_range(chars.length, function(err, val) {
			    		if (err == null) {
					    	password += chars[val];
					    	cb3();
				    	} else {
				    		cb3(err);
				    	}
			    	});
			    }, function () {
			      return (password.length < len);
			    }, function (err) {
			    	if (err == null) {
			    		cb2();
			    	} else {
				    	cb2(err);			    		
			    	}
			    }
		    );			
		}, function () {
			var typeCount = 0;

			if (symbols.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			if (numbers.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			if (upper.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			if (lower.some(function(v) { return password.indexOf(v) >= 0; })) {
				typeCount++;
			}

			return typeCount < minTypes;
		}, function (err) {
			if (err == null) {
				return cb(null, password);
			} else {
				return cb(err, null);
			}
		}
    );
}

/**
 * Express Configuration
 */

// All environments
app.set('port', 8000);
app.set('views', path.join(__dirname, 'server', 'views'));
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.methodOverride());
app.use(express.static(path.join(__dirname, 'public')));
app.use(app.router);

// Force Jade to compile with HTML5 doctype
app.locals.doctype = '5';

/**
 * Express Routes
 */

app.get('/', function (req, res) {
	res.render('index');
});

app.get('/wordpass', function (req, res) {
    var wordCount = 3;

	if (req.query.c != null && (!isNaN(req.query.c))) {
		var c = req.query.c;
		if (c >= 2 && c <= 10) {
			wordCount = c;
		}
	}

	createWordPassword(wordCount, 3, function (err, password) {
		if (err == null) {
			res.send(password);
		} else {
			res.send("ERROR GENERATING PASSWORD");
		}
	});
});

app.get('/randompass', function (req, res) {
	var passwordLength = 16;

	if (req.query.l != null && (!isNaN(req.query.l))) {
		var l = req.query.l;
		if (l >= 8 && l <= 64) {
			passwordLength = l;
		}
	}

	createRandomPassword(passwordLength, 3, function (err, password) {
		if (err == null) {
			res.send(password);
		} else {
			res.send("ERROR GENERATING PASSWORD");
		}
	});
});

// Read in the word list
words = fs.readFileSync('server/data/wordlist.txt', 'utf8').split(',');

// Start the HTTP server
server.listen(app.get('port'), function () {
	console.log('Express server listening on port ' + app.get('port'));
});