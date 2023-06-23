const User = require('../model/user-model')
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

// helper function that prints out a error message with the function name.
function errorMessage(s) {
    return res.json({ error: false, message: `Unauthorized operation ${s}.` });
}

// signup user here.
async function signupUser(req, res, _) {
    let { name, email, password } = req.body;
    // check for null
    if (!name || !email || !password) {
        res.json({error: true, message: 'Name, email and password must not be null.'});
        return;
    }
    let encodedEmail = encodeURIComponent(email);
    let id = uuidv4();

    // initialize new user
    const newUser = new User({
        name: name,
        email: email,
        password: password,
        active: false,
        id: id
    });

    // check if user exists.
    await User.exists({ email }).then(async (exists) => {
        // if user exists, don't do anything.
        if (exists) {
            return res.json({error: true, message: `User email "${email}" already exists.`});
        }
        // otherwise, save it.
        else {
            await newUser.save().then(() => {});

            // initialize email transport.
            const transport = nodemailer.createTransport({
                sendmail: true,
                newline: 'unix',
                path: '/usr/sbin/sendmail'
            });
            insideText = 'http://asfasd.cse356.compas.cs.stonybrook.edu/users/verify' + "?email=" + encodedEmail + "&key=" + id;
            //console.log(insideText);

            // send verification link to requested email.
            transport.sendMail({
                from: 'root@asfasd.cse356.compas.cs.stonybrook.edu',
                to: email,
                subject: 'verification link',
                text: insideText
            }, (err, info) => {
                //console.log(`Error occurred when trying to send mail: ${err}`);
                //console.log(`Info associated with error: ${JSON.stringify(info)}`);
            });

            return res.json({error: false, status: 'OK', message: `Successfully created new user "${name}" with email "${email}".`});
        }
    });
}

// login user here.
async function loginUser(req, res, _) {
    // check to make sure values aren't null.
    let { email, password } = req.body;
    if (email == null || password == null) {
        return res.json({ error: true, message: `email and password fields cannot be null.`});
    }

    // find our user.
    const user = await User.findOne({ email });
    // make sure user isn't null.
    if (user == null) {
        return res.json({error: true, message: `Failed to login - user email ${email} does not exist.`} );
    }
    // check password equality.
    if (user.password !== password) {
        return res.json({error: true, message: `Failed to login - wrong password.`});
    }
    // check if user is active.
    if (!user.active) {
        return res.json({error: true, message: `User ${email} must be verified first.`});
    }
    let name = user.name;
    const loginOptions = { maxAge: 1000 * 60 * 15 }; // options for setting in the amount of time a user will be logged in.
    try {
        res.cookie('name', name, loginOptions); // name has to be set before password, otherwise the cookie will not be detected.
        res.cookie('password', password, loginOptions); // this must be set after name.
        return res.json({error: false, status: 'OK', name: name});
    }
    catch (err) {
        return res.json({error: true, message: `Login failed with error: ${err}`});
    }
}

// logout user here.
async function logoutUser(req, res, _) {
    // check if cookies exist first.
    if (!req.cookies) {
        return res.json({ error: true, message: "Cookies don't exist." });
    }
    let { name, password } = req.cookies;
    //Checking for name and psswd cookies before clearing them. If null, return error.
    if (name == null || password == null) { 
        return res.json({ error: true, message: "Username and password cookies do not exist." });
    }
    // cookies exist. clear them.
    res.clearCookie('name'); // name has to be cleared first before password.
    res.clearCookie('password'); // this must be cleared after name.
    return res.json({ error: false, status: 'OK' });
}

// verify user here.
async function verifyUser(req, res, _) {
    // check to make sure values aren't null.
    let { email, key } = req.query;
    if (email == null || key == null) {
        return res.json({ error: true, message: 'email or key is null.'});
    }

    // get user.
    const user = await User.findOne({ email });

    // if user doesn't exist.
    if (user == null) {
        return res.json({error: true, message: `Failed to verify nonexistent user with email ${email}.`});
    }

    // don't do anything if user already is activated.
    if (user.active === true) {
        return res.json({error: true, message: `User with email ${email} is already verified.`});
    }

    // Check if supplied key is equal to user's id.
    // If so, update user.
    if (key === user.id) {
        await User.updateOne({ email }, { active: true }).then(() => {});
        return res.json({ error: false, status: 'OK', message: "User successfully verified."});
    }
    else return res.json({ error: true, message: `Key ${key} is not equal to user's id ${user.id}.`});
}

module.exports = {
    signupUser,
    loginUser,
    logoutUser,
    verifyUser
}
