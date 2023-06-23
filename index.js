const cors = require('cors');
const express = require('express');
const Y = require('yjs');
const path = require('path');
const multer = require('multer');
const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, 'uploads/');
    },
    filename: function (req, file, callback) {
        callback(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const ejsEngine = require('ejs-mate');
const { removeStopwords } = require('stopword');
const stemmer = require('porter-stemmer').stemmer;
const escapeStringRegexp = require('escape-string-regexp');
const { v4: uuidv4 } = require('uuid');
const QuillDeltaToHtmlConverter = require('quill-delta-to-html');
var qd2hc = QuillDeltaToHtmlConverter.QuillDeltaToHtmlConverter;
var elasticsearch = require('@elastic/elasticsearch');
const cluster = require('cluster');
const totalCPUs = require("os").cpus().length;

let cursors = new Map();
let loggedPeople = new Map();

if (cluster.isMaster) {
    console.log(`Number of CPUs is ${totalCPUs}`);
    console.log(`Master ${process.pid} is running`);
    
    // Fork workers.
    for (let i = 0; i < totalCPUs; i++) {
        cluster.fork();
    }
}
else {
    var elasticClient = new elasticsearch.Client({
        node: 'http://localhost:9200'
    });

    mongoose.connect('mongodb://127.0.0.1:27017/myapp');


    // sends a message to a person with the selected id.
    function msgToAll(msg, id) {
        let person = loggedPeople.get(id);
        if (person) person.res.write(`event: update\ndata: ${JSON.stringify(msg)}\n\n`);
    }


    // prints out a error message with the function name.
    function errorMessage(s, res) {
        return res.json({ error: true, message: `Unauthorized operation ${s}.` });
    }


    // create document here.
    async function createDocument(req, res, _) {
        // check for cookies.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(createDocument.name, res);
        }

        // initialize variables.
        let { name } = req.body;
        let body = "";
        let time = Date.now();

        // initialize document.
        let doc = {
            name: name,
            document: body,
            lastEdited: time
        }

        let id = uuidv4();

        // insert document into elasticsearch index.
        elasticClient.index({
            index: 'my-documents',
            body: doc,
            id: id
        });

        return res.json({id: id});
    }


    // delete document here.
    async function deleteDocument(req, res, _) {
        // check for cookies.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(deleteDocument.name, res);
        }

        // initialize variables.
        let { id } = req.body;

        // delete document with id.
        elasticClient.delete({
            index: 'my-documents',
            id: id
        });
        return res.sendStatus(200);
    }


    // get document list here.
    async function getDocumentList(req, res, _) {
        // check for cookies.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(getDocumentList.name, res);
        }
        let returnArr = [];

        elasticClient.search({
            index: 'my-documents',
            body: {
                query: {
                    match_all: {},
                },
                sort: [{
                    "lastEdited": {
                    "order":
                    "desc"
                    }
                }],
                size: 10
            },
        }, function (err, resp, status) {
            let arr = resp.body.hits.hits;
            // get array of documents and sort them by time of last edit.
            let size = (arr.length <= 10) ? arr.length : 10;
            // only use the first ten documents.
            for (let i = 0; i < size; i++) {
                returnArr.push( { id: arr[i]._id, name: arr[i]._source.name } );
            }
            return res.json(returnArr);
        });
    }


    // edit document here.
    async function editDocument(req, res, _) {
        // check if cookies exist.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(editDocument.name, res);
        }

        // get document from map and serve document.
        let id = req.params.id;
        let doc = new Y.Doc();
        let text = doc.getText();
        elasticClient.get({
            index: 'my-documents',
            id: id
        }, function (err, resp, status) {
            text.insert(0, resp.body._source.document);
        });

        let q = new qd2hc(text.toDelta());
        return res.json(q.convert());
    }


    // upload image here.
    async function uploadMediaFile(req, res, _) {
        // check for cookies.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(uploadMediaFile.name, res);
        }

        // check for mimetype. It must be an image of png, gif or jpg format.
        let mimeType = (req.file.mimetype).split('/');
        if (mimeType[0] !== "image") {
            return res.json({ error: true, message: "File is not an image." })
        }
        else if (mimeType[1] !== 'jpeg' && mimeType[1] !== 'png' && mimeType[1] !== 'jpg' && mimeType[1] !== 'gif') {
            return res.json({ error: true, message: "File is not a .jpeg, .jpg, .png, or .gif image." })
        }
        else return res.json({ error: false, status: 'OK', mediaid: req.file.filename });
    }


    // get image here.
    async function getMediaFile(req, res, _) {
        // check for cookies.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(getMediaFile.name, res);
        }

        // get mediaId, set options and send file.
        let { mediaid } = req.params;
        var options = {
            root: path.join(__dirname, 'uploads')
        };
        return res.sendFile(`${mediaid}`, options);
    }


    // send event stream here.
    async function sendEventStream(req, res, _) {
        if (!req.cookies || !req.cookies.name) {
            return res.json({ error: true, message: "Attempted login before connection." });
        }
        try {
            // initialize headers.
            let headers = {
                'Content-Type': 'text/event-stream',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache'
            };
            // write 200 to headers.
            res.writeHead(200, headers);
            let data = null;
            let id = req.params.id;
            let doc = new Y.Doc();
            let text = doc.getText();
            elasticClient.get({
                index: 'my-documents',
                id: id
            }, function (err, resp, status) {
                if (err) {
                    console.log("Error:", err);
                }
                text.insert(0, resp.body._source.document);
            });
            const stringifiedArr = JSON.stringify(Array.from(Y.encodeStateAsUpdate(doc)));
            let client = {
                id: id,
                res
            };
            // write information to current clients.
            (loggedPeople.has(id) === false) && loggedPeople.set(id, client);
            data = `event: sync\ndata: ${stringifiedArr}\n\n`;
            res.write(data);
            res.on('close', () => {
                console.log(`Connection successfully closed.`);
            });
        } catch (e) {
            console.log(`Error: ${e}`);
        }
    }


    // submit CRDT operation here.
    async function submitCRDTOperation(req, res, _) {
        if (!req.cookies || !req.cookies.name) {
            return res.json({ error: true, message: "Unauthorized status code" });
        }
        let { index, length, sessionID } = req.body;
        let id = req.params.id;
        let doc = new Y.Doc();
        let text = doc.getText();
        let name = "";
        elasticClient.get({
            index: 'my-documents',
            id: id
        }, function (err, resp, status) {
            text.insert(0, resp.body._source.document);
            name = resp.body._source.name;
        });

        if (sessionID) {
            let cursor = null;
            let currentCursor = JSON.parse(cursors.get(sessionID));
            if (!currentCursor) {
                return;
            }
                
            currentCursor = {
                cursor: {
                    index: index,
                    length: length
                },
                name: currentCursor.name,
                session_id: currentCursor.session_id
            }
            cursor = currentCursor;
            cursors.set(sessionID, JSON.stringify(currentCursor));
            
            res.status(200).send('Post updated.');
            let person = loggedPeople.get(id);
            if (person) {
                person.res.write(`event: presence\ndata: ${JSON.stringify(cursor)}\n\n`);
            }
            return;
        } else {
            let update = Uint8Array.from(req.body);
            Y.applyUpdate(doc, update);
            let time = Date.now();
            let newDoc = {
                name: name,
                document: doc.getText().toString(),
                lastEdited: time
            }

            elasticClient.index({
                index: 'my-documents',
                body: newDoc,
                id: id
            });

            res.status(200).send('Post updated.');
            return msgToAll(req.body, id);
        }
    }


    // submit new cursor here.
    async function submitNewCursor(req, res, _) {
        // check for cookies.
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(submitNewCursor.name, res);
        }

        let { id } = req.params;
        let { index, length } = req.body;
        let session_id = Date.now();
        let cursor = JSON.stringify({
            session_id: session_id,
            name: req.cookies.name,
            cursor: {
                index: index,
                length: length
            }
        })
        let person = loggedPeople.get(id);
        if (person) {
            person.res.write(`event: presence\ndata: ${cursor}\n\n`);
        }
        cursors.set(session_id, cursor);
        return res.json(cursor);
    }


    // go to home here.
    async function goToHome(req, res, _) {
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(goToHome.name, res);
        }
        return res.render('index');
    }


    function calculateRelevance(docName, docText, regex) {
        let arr = docText.replace(/[^\w\s\']|_/g, "").replace(/\s+/g, " ").toLowerCase().trim().split();
        let relevance = 0;
        let penalty = 0;
        if (matchSet(docName, regex)) relevance += 1000;
        let wordMatched = false;
        arr.forEach((word) => {
            for (const regexWord of regex) {
                if (word.match(regexWord)) {
                    wordMatched = true;
                    break;
                }
            }
            if (wordMatched === true) {
                relevance += 100;
                penalty = 0;
            }
            else {
                relevance -= ++penalty;
            }
        });
        regex.forEach((word) => {
            relevance += ((docText || '').match(new RegExp(word, "g")) || []).length;
        });
        console.log(`Relevance is ${relevance}.`);
        return relevance;
    }

    function calculateSnippetSingleWord(arr, word, index) {
        let wordCountBack = 0;
        let wordCountForward = 0;
        let leftIndex = 0;
        let rightIndex = arr.length;

        // check words to left.
        for (let i = index - 1; i >= 0; i--) {
            if (word === arr[i]) {
                wordCountBack = 0;
            }
            else wordCountBack += 1;
            if (wordCountBack === 10) {
                leftIndex = i; break;
            }
        }

        // check words to right.
        for (let i = index + 1; i < arr.length; i++) {
            if (word === arr[i]) {
                wordCountForward = 0;
            }
            else wordCountForward += 1;
            if (wordCountForward === 10) {
                rightIndex = i + 1; break;
            }
        }

        return arr.slice(leftIndex, rightIndex).join(' ');
    }

    function calculateSnippet(docText, regex) {
        // get rid of stopwords, punctuation, and excess spaces.
        let arr = removeStopwords(docText.replace(/[^\w\s\']|_/g, "").replace(/\s+/g, " ").trim().toLowerCase().split(' '));
        let index = 0;

        let snippet = "";

        // clone regex.
        let regexCopy = new Set(regex);

        for (index; index < arr.length; index++) {
            if (regexCopy.has(arr[index])) {
                snippet = snippet + calculateSnippetSingleWord(arr, arr[index], index);
                regexCopy.delete(arr[index]);
                regex.forEach(word => {
                    if (regexCopy.has(word) && snippet.match(word)) regexCopy.delete(word);
                });
                if (regexCopy.size !== 0) snippet = snippet + " ... ";
            }
            if (regexCopy.size === 0) break;
        }

        return boldSetWords(snippet, regex);
    }

    // checks if at least 1 word in set matches text and then returns true if so.
    function matchSet(text, set) {
        text = text.toLowerCase();
        let found = false;
        set.forEach((word) => {
            if (text.match(word)) {
                found = true;
                return;
            }
        });
        return found;
    }

    // bolds all words from a text that are found in a set.
    function boldSetWords(text, set) {
        set.forEach((word) => {
            text = text.replaceAll(word, `<em>${word}</em>`);
        });
        return text;
    }

    /** 
     * This returns up to 10 documents that include
     * the searched word from q in the document name or body
     * as a JSON array, ordered in descending order of relevance.
     * The snippet is an excerpt from the document that surrounds the
     * search phrase where the search terms are surrounded
     * with <em>...</em> markers. 
     * (Note: Don't forget to remove stop words and use stemming.) 
    */
    async function searchDocuments(req, res, _) {
        // check for cookies
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(searchDocuments.name, res);
        }

        let q = removeStopwords(req.query.q?.trim()?.toLowerCase()?.split(' ')).join(' ');

        elasticClient.search({
            index: 'my-documents',
            body: {
                query: {
                    match_phrase: { "document": { "query": q } }
                },
                highlight: {
                    fields: {
                        "document": {}
                    }
                },
                size: 10
            },
        }, function (err, resp, status) {
            let arr = resp.body.hits.hits;
            // get array of documents and sort them by time of last edit.
            let size = (arr.length <= 10) ? arr.length : 10;
            // only use the first ten documents.
            let returnArr = [];
            for (let i = 0; i < size; i++) {
                returnArr.push( { docid: arr[i]._id, name: arr[i]._source.name, snippet: arr[i].highlight.document[0] } );
            }
            return res.json(returnArr);
        });

        /*const $regex = new Set(qArr);

        // get documents.
        let docs = [...documents.entries()].filter((x => matchSet(x[1].name, $regex) || matchSet(x[1].document.getText().toString(), $regex)))
            .sort(function (a, b) {
                return calculateRelevance(b[1].name, b[1].document.getText().toString(), $regex) - calculateRelevance(a[1].name, a[1].document.getText().toString(), $regex);
            });
        console.log("search: docs is " + docs);


        // this array contains [{docid, name, snippet}...]
        let returnArr = [];
        for (let i = 0; i < docs.length; i++) {
            let doc = docs[i];
            let snippet = calculateSnippet(doc[1].document.getText().toString(), $regex);
            let obj = {"docid": doc[0], "name": doc[1].name, "snippet": snippet};
            returnArr.push(obj);
        }

        return res.json(returnArr);*/
    }


    /**
     * This returns an array of suggested word completions starting
     * with the queried prefix, sorted in descending order of relevant
     * (at least one suggestion must be returned if any of the documents
     * in the system include a word starting with the specified prefix).
     * The result is a JSON array [strings,...], ordered from the most
     * relevant completion first.  The queried prefix is expected to be
     * at least 4 letters long and the returned completions must be at
     * least 1 character longer than the queried prefix.
     */
    async function suggestedWordCompletions(req, res, _) {
        // check for cookies
        if (!req.cookies || !req.cookies.name) {
            return errorMessage(suggestedWordCompletions.name, res);
        }

        let q = req.query.q.toLowerCase();
        console.log("q is", q);
        if (q.length < 4) {
            return res.json([]);
        }

        elasticClient.search({
            index: 'my-documents',
            body: {
                query: {
                    match_all: {},
                }
            },
        }, function (err, resp, status) {
            let arr = resp.body.hits.hits;
            let size = arr.length;
            console.log("Size is", size);
            let docArr = [];
            for (let i = 0; i < size; i++) {
                console.log(`arr[${i}]._source is ${arr[i]._source}.`);
                console.log(`arr[${i}]._source.document is ${arr[i]._source.document != null ? arr[i]._source.document.length : "null" }.`);
                docArr.push( arr[i]._source.document );
            }
            docArr = docArr.filter(doc => doc.includes(q));

            console.log("docArr size is", docArr.length);

            let dict = {};
            for (let i = 0; i < docArr.length; i++) {
                let wordArr = removeStopwords(docArr[i].replace(/[^\w\s\']|_/g, "").replace(/\s+/g, " ").toLowerCase().trim().split(' '));
                //console.log(`suggest (${i}): wordArr is ${wordArr}`);
                for (let j = 0; j < wordArr.length; j++) {
                    let word = wordArr[j];
                    if (word.length > q.length && word.startsWith(q)) {
                        dict[word] = (dict[word] != null) ? dict[word] + 1 : 1;
                    }
                }
            }

            let returnArr = Object.keys(dict).sort(function(a, b) { return dict[b] - dict[a] });

            return res.json(returnArr);
        });
    }

    const app = express();

    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.static(path.join(__dirname, 'views')));
    app.use(cors());
    app.engine('ejs', ejsEngine);
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.use(cookieParser());

    app.use((_, res, next) => {
        res.setHeader('X-CSE356', '6306e95158d8bb3ef7f6c4c7'); // set header
        next();
    })

    const userRouter = require('./server/routes/user-routes'); // user routes from ./server
    app.use(userRouter);

    app.use('/test', express.static(path.join(__dirname, '/dist')));

    app.post('/collection/create', createDocument);
    app.post('/collection/delete', deleteDocument);
    app.get('/collection/list', getDocumentList);
    app.use('/edit/:id', editDocument);
    app.post('/media/upload', upload.single('file'), uploadMediaFile);
    app.get('/media/access/:mediaid', getMediaFile);
    app.get('/api/connect/:id', sendEventStream);
    app.post('/api/op/:id', submitCRDTOperation);
    app.post('/api/presence/:id', submitNewCursor);
    app.get('/home', goToHome);
    app.get('/index/search', searchDocuments);
    app.get('/index/suggest', suggestedWordCompletions);

    // use library crdt js here.
    app.use('/library/crdt.js', express.static(path.join(__dirname, '/dist/crdt.js')));

    app.listen(80);
    console.log("Listening on port 80...");
}
