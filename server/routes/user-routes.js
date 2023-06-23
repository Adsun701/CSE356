const express = require('express')
const router = express.Router()
const UserController = require('../controller/user-controller')


// user function routes
router.get('/users/verify', UserController.verifyUser); // verifies user
router.get('/users/logout', UserController.logoutUser); // logouts user
router.post('/users/login', UserController.loginUser); // logins user
router.post('/users/signup', UserController.signupUser); // creates a user

module.exports = router