/**
 * A fairly simple command-line tool
 * to fetch all posts from certain
 * author(s) wall in VKontakte social
 * network.
 *
 * APIs used:
 * https://vk.com/pages?oid=-17680044&p=wall.get
 * https://vk.com/pages?oid=-17680044&p=getProfiles
 *
 * Usage:
 *   $ npm install
 *   $ node vk-fetch-posts --authors 1,2,3 --group 4
 *
 * @type {exports}
 */

var https = require('https'),
    mkdirp = require('mkdirp'),
    request = require('request'),
    program = require('commander'),
    pjson = require('./package.json'),
    FileQueue = require('filequeue'),
    fs = require('fs');
var fq = new FileQueue(100);

var authIds = [];//"103279512,10522384,15666691,1732372,201188,2180211,2422348,3206615,3510939,35674186,40031,675490,88158188,987082";
var authors = {};
var groupId; //-14837503&

var source = './tmp/';
var result = './result/';
program
    .version(pjson.version)
    .option('-a, --authors [items]', 'A comma-separated list of authors ids', function (val) {
        authIds = val.split(',');
        var l = authIds.length;
        while (l--) {
            if (isNaN(parseInt(authIds[l]))) {
                console.error('Wrong argument: ', authIds[l]);
                process.exit(255);
            }
        }
        return authIds;
    })
    .option('-g --group <item>', 'A group id to work with', function (val) {
        if (isNaN(val)) {
            console.error('Wrong argument: ', val);
            process.exit(255);
        }
        else {
            groupId = val;
        }
    })
    .parse(process.argv);

if (!program.group) {
    console.error("You haven't provided enough arguments.");
    program.help();
}

mkdirp(result, mkdirCallback);

// All set, lets start downloading.
// TODO: Consider using Promises and create
//       execution chain here, rather than
//       calling functions from functions.
if (!fs.existsSync(source)) {
    // Download only in case we don't have
    // any source directory, since it is
    // a fairly costly operation.
    fetchPosts(0, undefined, 1);
    mkdirp(source, mkdirCallback);
}
else {
    start();
}

function mkdirCallback(err) {
    if (err) {
        console.error("Can't create directories. Exiting...");
        throw err;
    }
}

function fetchPosts(offset, totalPosts, count) {
    https.get('https://api.vk.com/method/wall.get?owner_id=' + groupId + '&count=' + count + '&offset=' + offset + '&filter=owner', function (res) {
        var responseString = '';
        res.on('data', function (chunk) {
            responseString += chunk;
        });
        res.on('end', function () {
            if (!totalPosts) {
                var responseJson = JSON.parse(responseString);
                totalPosts = responseJson.response[0];
            }
            fq.writeFile(source + 'batch_' + offset + '.txt', responseString, function () {
                console.log("Downloaded posts batch " + offset);
                if (offset < totalPosts) {
                    fetchPosts(offset + count, totalPosts, 100);
                }
                else {
                    console.info("Downloaded everything, proceeding...");
                    start();
                }
            });
        });
    });
}

/**
 * Starting point: fetch proper names for authors IDs
 */
function start() {
    if (!authIds.length) {
        processFiles();
    }
    else {
        console.info("Fetching authors info...");
        https.get("https://api.vk.com/method/getProfiles?user_ids=" + authIds.join(','), function (res) {
            var responseString = '';
            res.on('data', function (chunk) {
                responseString += chunk;
            });
            res.on('end', function () {
                var resJson = JSON.parse(responseString);
                console.info(resJson);
                for (var i = 0, l = resJson.response.length; i < l; i++) {
                    var author = resJson.response[i];
                    authors[ author.uid ] = author;
                }
                console.log("...done.");
                processFiles();
            });
        }).on('error', function (e) {
            console.log("Got error: " + e.message);
        });
    }
}

/**
 * Process files in source directory
 */
function processFiles() {
    console.log("Processing files in ", source, ".");
    fq.readdir(source, function (err, files) {
        if (err) throw err;
        for (var i = 0, l = files.length; i < l; i++) {
            processFile(source + files[ i ]);
        }
    });
}

/**
 * Process a single file.
 *
 * @param file
 */
function processFile(/* String */ file) {
    console.log("Reading file...", file);
    fq.readFile(file, { flag: 'r'}, function (err, jsonString) {
        var fileCont;
        try {
            fileCont = JSON.parse(jsonString);
        }
        catch (e) {
            console.log("Failed to parse ", file, ", skipping...", e);
            return;
        }
        for (var i = 1, l = fileCont.response.length; i < l; i++) {
            processPost(fileCont.response[ i ]);
        }
    });
}

/**
 * Process a post object.
 *
 * @param post
 */
function processPost(/* Object */ post) {
    var id = post.id;
    if (post.post_type != 'post') {
        console.log('Post [' + id + '] is a re-post, skipping');
        return;
    }
    var signerId = post.signer_id;
    var text = post.text;
    var authorInfo = authors[ signerId ];
    var authorName = authorInfo ? authorInfo.first_name + " " + authorInfo.last_name : "Anonymous";

    // Construct a nice looking date from unix time.
    var date = post.date;
    var prettyDate = new Date(0);
    prettyDate.setUTCSeconds(date);
    var year = prettyDate.getFullYear();
    var month = prettyDate.getMonth() + 1;
    if (month < 10) month = '0' + month;
    var day = prettyDate.getDate();
    if (day < 10) day = '0' + day;
    var timeStamp = year + '-' + month + '-' + day;

    // IMPORTANT: Directory and file structure for this post
    var postFolder = result + authorName + '/' + timeStamp + '_' + id;
    mkdirp(postFolder, function () {
        fq.writeFile(postFolder + "/text.txt",
                post.text + "\n Автор: " + authorName + "\n" +
                "Vk link: https://vk.com/wall" + post.from_id + '_' + id,
            function () {
                if (post.attachments) {
                    processAttachments(post.attachments, postFolder);
                }
            }
        );
    });
}

/**
 * Process post attachments.
 *
 * @param attachments
 * @param postFolder
 */
function processAttachments(/* Object */ attachments, /* String */ postFolder) {
    for (var i = 0, l = attachments.length; i < l; i++) {
        var attachment = attachments[ i ];
        var type = attachment.type;
        var attachmentsDir = postFolder + "/attachments/";
        if (type != 'photo' && type != 'link') return;
        mkdirp(attachmentsDir, function (type, attachment, attachmentsDir, i) {
            return (function (type, attachments, attachmentsDir, i) {
                if (type == 'photo') {
                    var id = attachment.photo.pid;
                    var fileName = attachmentsDir + id;
                    var src = attachment.photo.src;
                    var ext = src.match('.jpg') ? '.jpg' : '.png';
                    download(src, fileName + ext, function () {
                        fq.writeFile(fileName + ".txt", attachment.photo.text, function () {
                            console.log("Downloaded: ", src);
                        });
                    });
                }
                else if (type == 'link') {
                    fq.writeFile(attachmentsDir + 'link_' + i + '.txt', JSON.stringify(attachment.link), function () {
                        console.log("Wrote link");
                    });
                }
            })(type, attachments, attachmentsDir, i);
        });
    }
}
/**
 * Helper method to make a HEAD request
 * to specified URI
 *
 * @param uri URI to call
 * @param filename filename to use for downloaded
 * @param callback A callback to execute on close
 */
function download(uri, filename, callback) {
    request.head(uri, function (/*err, res, body*/) {
        var filestream = fq.createWriteStream(filename);
        request(uri).pipe(filestream).on('close', callback);
    });
}
