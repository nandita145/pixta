const express = require('express');
const app = express();
var http = require('http').createServer(app);
require('dotenv').config();
var mongodb = require('mongodb');
var ObjectId = mongodb.ObjectId;
var mongoClient = mongodb.MongoClient;

mainUrl = 'http://localhost:3000/';
var database = null;

app.use('/public', express.static(__dirname + '/public'));
app.set('view engine', 'ejs');
app.use(express.json());

var expressSession = require('express-session');
const MemoryStore = require('memorystore')(expressSession)
app.use(expressSession({
    'key': 'user_id',
    'secret': 'usersecretobjectID',
    'resave': true,
    'saveUninitialized': true,
    store: new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
    })
}));

var bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '10000mb' }));
app.use(bodyParser.urlencoded({
    extended: true, limit: '10000mb',
    parameterLimit: 1000000
}));

var bcrypt = require('bcrypt');

var formidable = require('formidable');
// const formidable = require("express-formidable")
// app.use(formidable({
//     multiples: true, // request.files to be arrays of files
// }))

var fileSystem = require('fs');
const { toArray } = require('mongodb/lib/operations/cursor_ops');
// const multer = require("multer");
// const { response } = require('express');

function getUser(userId, callBack) {
    database.collection('users').findOne({
        '_id': ObjectId(userId)
    }, function (error, result) {
        if (error) {
            console.log(error);
            return;
        }
        if (callBack != null) {
            callBack(result)

        }
    });
}
const cloudinary = require('cloudinary');
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

http.listen(process.env.PORT || 3000, function () {
    console.log("Connected");

    mongoClient.connect(process.env.DATABASE, { useUnifiedTopology: true },
        function (error, client) {
            if (error) {
                console.log(error);
                return;
            }
            database = client.db("social_nosql");

            app.get('/', async function (request, response) {
                var ses = request.session.user_id
                if (request.session.user_id) {

                    var loggedInUser = await database.collection('users').findOne({
                        '_id': ObjectId(request.session.user_id)
                    });

                    var myFollowing = loggedInUser.following;

                    const arr = [];

                    myFollowing.forEach(object => {
                        arr.push(ObjectId(object._id));
                    });


                    var followersPost = await database.collection('images').find({ "user._id": { $in: arr } }).sort({
                        'createdAt': -1
                    }).toArray(function (error1, images) {
                        if (request.session.user_id) {
                            getUser(request.session.user_id, function (user) {

                                response.render('index', {
                                    'isLogin': true,
                                    'query': request.query,
                                    'user': user,
                                    'images': images
                                });
                            })
                        }


                    });
                } else {
                    response.redirect('/login')
                }


            });


            app.get('/register', function (request, response) {
                response.render('register', {
                    'query': request.query
                });
            });

            app.post('/register', function (request, response) {
                if (request.body.password != request.body.confirm_password) {
                    response.redirect('/register?error=mismatch');
                    return;
                }

                database.collection('users').findOne({
                    'email': request.body.email
                }, function (error1, user) {
                    if (user == null) {
                        bcrypt.hash(request.body.password, 10, function (error3, hash) {
                            database.collection('users').insertOne({

                                'name': request.body.name,
                                'email': request.body.email,
                                'password': hash,
                                'followers': [],
                                'following': [],
                                'profile': '/public/profile/default.jpg'
                            }, function (error2, data) {
                                response.redirect('/login?message=registered')
                            });
                        });
                    } else {
                        response.redirect('/register?error=exists');
                    }
                });
            });

            app.get('/login', function (request, response) {
                response.render('login', {
                    'query': request.query
                });
            });

            app.post('/login', function (request, response) {
                var email = request.body.email;
                var password = request.body.password;

                database.collection('users').findOne({
                    'email': email
                }, function (error1, user) {
                    if (user == null) {
                        response.redirect('/login?error=not_exists');
                    } else {
                        bcrypt.compare(password, user.password, function (error2, isPasswordVerify) {
                            if (isPasswordVerify) {
                                request.session.user_id = user._id;
                                response.redirect('/');
                            } else {
                                response.redirect('login?error=wrong_password')
                            }
                        });
                    }
                })
            });

            app.get('/logout', function (request, response) {
                request.session.destroy();
                response.redirect('/');
            });


            app.get('/my_uploads', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, function (user) {
                        database.collection('images').find({
                            'user._id': ObjectId(request.session.user_id)
                        }).sort({
                            'createdAt': -1
                        }).toArray(function (error1, images) {
                            response.render('index', {
                                'isLogin': true,
                                'query': request.query,
                                'images': images,
                                'user': user
                            })

                        })
                    })
                } else {
                    response.redirect('login');
                }
            });

            // var fs=require('fs-extra');

            // app.post('/upload-image', async function (request, response) {
            //     if (request.session.user_id) {
            //         var formData = new formidable.IncomingForm();
            //         formData.maxFileSize = 1000 * 1024 * 1024;
            //         formData.parse(request, function (error1, fields, files) {

            //             var oldPath = files.image.path;
            //             var caption = fields.caption;

            //             var newPath = 'public/uploads/' + new Date().getTime() + '-' + files.image.name;

            //             fileSystem.rename(oldPath, newPath, function (error2) {
            //                 getUser(request.session.user_id, function (user) {

            //                     // console.log(user+'uploimg')
            //                     delete user.password;
            //                     var currentTime = new Date().getTime();

            //                     database.collection('images').insertOne({
            //                         'filePath': newPath,
            //                         'user': user,
            //                         'caption': caption,
            //                         'createdAt': currentTime,
            //                         'likers': [],
            //                         'comments': []

            //                     }, function (error2, data) {
            //                         response.redirect('/?message=image_uploaded');
            //                     })
            //                 })
            //             })
            //         })
            //     }
            // })



            app.post('/upload-image', async function (request, response) {
                if (request.session.user_id) {
                    var formData = new formidable.IncomingForm();
                    formData.maxFileSize = 1000 * 1024 * 1024;
                    formData.parse(request, function (error1, fields, files) {
                        getUser(request.session.user_id, function (user) {
                            // var oldPath = files.image.path;
                            var caption = fields.caption;
                            var oldpath = files.image.path;
                            var img = fileSystem.readFileSync(oldpath);
                            var publicid;
                            var iurl;
                            cloudinary.uploader.upload(oldpath, function (result) {
                                // console.log(result)
                                for (var attributename in result) {
                                    if (attributename == 'public_id') {
                                        publicid = result[attributename]
                                    }
                                    if (attributename == 'url') {
                                        iurl = result[attributename]
                                    }
                                }
                                var currentTime = new Date().getTime();
                                delete user.password;
                                // mongoClient.connect(process.env.DATABASE, function(err, db) {
                                //   if (err) throw err;
                                //   var dbo = db.db("mydb");
                                var myobj = {
                                    // name:publicid ,
                                    //  imageURl: iurl ,
                                    'filePath': iurl,
                                    'user': user,
                                    'caption': caption,
                                    'createdAt': currentTime,
                                    'likers': [],
                                    'comments': []
                                }
                                database.collection("images").insertOne(myobj, function (err, res) {
                                    if (err){
                                        throw err
                                    }
                                    else{
                                        response.redirect('/?message=image_uploaded');
                                        
                                    }
                                    // console.log("1 document inserted");
                                    // db.close();
                                });

                                // var mysort = { name: 1 };
                                // database.collection("images").find().sort(mysort).toArray(function (err, result) {
                                //     if (err) throw err;
                                //     console.log(result);
                                //     // db.close();
                                // });

                                // , function (error2, data) {
                                //     response.redirect('/?message=image_uploaded');
                                // }
                            });
                        });

                        // var newPath = 'public/uploads/' + new Date().getTime() + '-' + files.image.name;

                        // fileSystem.rename(oldPath, newPath, function (error2) {
                        //     getUser(request.session.user_id, function (user) {

                        //         // console.log(user+'uploimg')
                        //         delete user.password;
                        //         var currentTime = new Date().getTime();

                        //         database.collection('images').insertOne({
                        //             'filePath': newPath,
                        //             'user': user,
                        //             'caption': caption,
                        //             'createdAt': currentTime,
                        //             'likers': [],
                        //             'comments': []

                        //         }, function (error2, data) {
                        //             response.redirect('/?message=image_uploaded');
                        //         })
                        //     })
                        // })
                        })
                    }
            })



            app.get('/view-image', function (request, response) {

                database.collection("images").findOne({
                    "_id": ObjectId(request.query.id)
                }, function (error1, image) {
                    if (request.session.user_id) {
                        getUser(request.session.user_id, function (user) {
                            // console.log(image);
                            response.render("view-image", {
                                "isLogin": true,
                                "query": request.query,
                                "image": image,
                                "user": user
                            });
                        });
                    } else {
                        response.render("view-image", {
                            "isLogin": false,
                            "query": request.query,
                            "image": image,

                        })
                    }

                })
            });


            app.post('/do-like', function (request, response) {
                if (request.session.user_id) {
                    database.collection('images').findOne({
                        '_id': ObjectId(request.body._id),
                        'likers._id': request.session.user_id
                    }, function (error1, video) {
                        if (video == null) {
                            database.collection("images").updateOne({
                                "_id": ObjectId(request.body._id)
                            }, {
                                $push: {
                                    "likers": {
                                        "_id": request.session.user_id
                                    }
                                }
                            }, function (erro2, data) {
                                response.json({
                                    'status': 'success',
                                    'message': 'Image has been liked'
                                });
                            });
                        } else {
                            response.json({
                                'status': 'error',
                                'message': 'You have already liked this image.'
                            });
                        }
                    });
                } else {
                    response.json({
                        'status': 'error',
                        'message': 'Please login to perform this action.'
                    });
                }
            });


            app.post('/do-comment', function (request, response) {
                if (request.session.user_id) {
                    var comment = request.body.comment;
                    var _id = request.body._id;

                    getUser(request.session.user_id, function (user) {
                        delete user.password;

                        database.collection('images').findOneAndUpdate({
                            '_id': ObjectId(_id)
                        }, {
                            $push: {
                                'comments': {
                                    '_id': ObjectId(),
                                    'user': user,
                                    'comment': comment,
                                    'createdAt': new Date().getTime()
                                }
                            }
                        }, function (error1, data) {
                            response.redirect('/view-image?id=' + _id + '&message=success#comments')
                        });
                    });
                } else {
                    response.redirect('/view-image?id' + _id + "&error=not_login#comments")
                }
            });



            app.get('/search', function (request, response) {
                // collection= db.collection('users');
                if (request.session.user_id) {
                    getUser(request.session.user_id, function (user) {
                        database.collection('users').find({
                            'name': { $regex: `^${request.query.search}.*`, $options: 'si' }
                        }).toArray(function (error1, search) {
                            response.render('search', {
                                'isLogin': true,
                                'query': request.query,
                                'user': user,
                                // 'images': images,
                                'search': search,
                                'count': search.length,
                            });
                        })


                    })
                }
            })



            app.get('/view-profile', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {

                        requested_user = request.query.id;
                        // requested_user=request.body.id;
                        // console.log("ru",requested_user)
                        var requestedUser = await database.collection('users').find({
                            '_id': ObjectId(requested_user)
                        }).toArray()
                        var Images = await database.collection('images').find({
                            'user._id': ObjectId(requested_user)
                        }).sort({
                            'createdAt': -1
                        }).toArray()

                        var followStatus = await database.collection('users').findOne({
                            '_id': ObjectId(requested_user),
                            'followers._id': ObjectId(request.session.user_id)
                        })
                        var following = 'Follow';
                        if (followStatus) {
                            following = 'Following'
                        } else {
                            following = 'Follow'
                        }
                        var userDetails = await database.collection('users').findOne({
                            '_id': ObjectId(request.query.id)
                        })
                        // console.log(userDetails)
                        // console.log(userDetails.followers, userDetails.following)

                        var followers_list = await database.collection('users').find({
                            '_id': { "$in": userDetails.followers }
                        })
                        // console.log(followers_list)


                        var followings_list = await database.collection('users').find({
                            '_id': { "$in": userDetails.following }
                        })
                        // console.log(followings_list)

                        // console.log("images", Images)
                        // console.log("ok " + requestedUser[0].followers+ JSON.stringify(requestedUser))
                        var ownProfile = user._id.toString() == requestedUser[0]._id.toString() ? true : false
                        // console.log(ownProfile)
                        response.render('view-profile', {
                            'isLogin': true,
                            'query': request.query,
                            'images': Images,
                            'user': user,
                            'requestedUser': requestedUser[0],
                            'following': following,
                            'ownProfile': ownProfile,
                            'followers_list': userDetails.followers,
                            'followings_list': userDetails.following

                        });
                    });
                }
            });
            // app.get('/view-profile', function (request, response) {
            //     if (request.session.user_id) {
            //         getUser(request.session.user_id, async function (user) {

            //             requested_user = request.query.id;
            //             // requested_user=request.body.id;
            //             // console.log("ru",requested_user)
            //             var requestedUser = await database.collection('users').find({
            //                 '_id': ObjectId(requested_user)
            //             }).toArray()
            //             var Images = await database.collection('images').find({
            //                 'user._id': ObjectId(requested_user)
            //             }).sort({
            //                 'createdAt': -1
            //             }).toArray()

            //             var followStatus = await database.collection('users').findOne({
            //                 '_id': ObjectId(requested_user),
            //                 'followers._id': request.session.user_id
            //             })
            //             var following = 'Follow';
            //             if (followStatus) {
            //                 following = 'Following'
            //             } else {
            //                 following = 'Follow'
            //             }
            //             var userDetails = await database.collection('users').findOne({
            //                 '_id': ObjectId(request.query.id)
            //             })
            //             // console.log(userDetails)
            //             // console.log(userDetails.followers, userDetails.following)

            //             var followers_list = await database.collection('users').find({
            //                 '_id': { "$in": userDetails.followers }
            //             })
            //             // console.log(followers_list)


            //             var followings_list = await database.collection('users').find({
            //                 '_id': { "$in": userDetails.following }
            //             })
            //             // console.log(followings_list)

            //             // console.log("images", Images)
            //             // console.log("ok " + requestedUser[0].followers+ JSON.stringify(requestedUser))
            //             var ownProfile = user._id.toString() == requestedUser[0]._id.toString() ? true : false
            //             // console.log(ownProfile)
            //             response.render('view-profile', {
            //                 'isLogin': true,
            //                 'query': request.query,
            //                 'images': Images,
            //                 'user': user,
            //                 'requestedUser': requestedUser[0],
            //                 'following': following,
            //                 'ownProfile': ownProfile,
            //                 'followers_list': userDetails.followers,
            //                 'followings_list': userDetails.following

            //             });
            //         });
            //     }
            // });

            
            // app.post('/follow', function (request, response) {
            //     if (request.session.user_id) {
            //         getUser(request.session.user_id, async function (user) {
            //             var idToFollow = request.body.follow;
            //             // console.log(idToFollow);
            //             var RequestedUserArray = await database.collection('users').findOneAndUpdate({
            //                 '_id': ObjectId(idToFollow)
            //             }, {
            //                 $addToSet: {
            //                     "followers": {
            //                         "_id": request.session.user_id
            //                     }
            //                 }
            //             })

            //             var loggedInUserArray = await database.collection('users').findOneAndUpdate({
            //                 '_id': ObjectId(request.session.user_id)
            //             }, {
            //                 $addToSet: {
            //                     "following": {
            //                         "_id": idToFollow
            //                     }

            //                 }
            //             })
            //             response.redirect('view-profile?id=' + idToFollow)

            //         })
            //     }
            // });

            app.post('/follow', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        var idToFollow = request.body.follow;
                        // console.log(idToFollow);
                        var userToFollow= await database.collection('users').findOne({
                            '_id':ObjectId(idToFollow)
                        })
                        // console.log(userToFollow)
                        delete user.password;
                        delete user.followers;
                        delete user.following;
                        var RequestedUserArray = await database.collection('users').findOneAndUpdate({
                            '_id': ObjectId(idToFollow)
                        }, {
                            $addToSet: {
                                "followers": user
                                
                            }
                        })

                        delete userToFollow.password;
                        delete userToFollow.followers;
                        delete userToFollow.following;
                        var loggedInUserArray = await database.collection('users').findOneAndUpdate({
                            '_id': ObjectId(request.session.user_id)
                        }, {
                            $addToSet: {
                                "following":  userToFollow


                            }
                        })
                        response.redirect('view-profile?id=' + idToFollow)

                    })
                }
            });
            app.post('/unfollow', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        var idToUnfollow = request.body.follow;
                        var userToUnfollow= await database.collection('users').findOne({
                            '_id':ObjectId(idToUnfollow)
                        })
                        // console.log(idToUnfollow)
                        delete user.password;
                        delete user.followers;
                        delete user.following;
                        delete userToUnfollow.password;
                        delete userToUnfollow.followers;
                        delete userToUnfollow.following;
                        // console.log(idToFollow);
                        // console.log("user to unfollow",userToUnfollow)
                        var RequestedUserArray = await database.collection('users').findOneAndUpdate({
                            '_id': ObjectId(idToUnfollow)
                        }, {
                            $pull: {
                                "followers": user
                            }
                        })

                        var loggedInUserArray = await database.collection('users').findOneAndUpdate({
                            '_id': ObjectId(request.session.user_id)
                        }, {
                            $pull: {
                                "following":userToUnfollow

                            }
                        })

                        // console.log(loggedInUserArray)
                        response.redirect('view-profile?id=' + idToUnfollow)

                    })
                }
            })





            app.post('/like', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        var idToLike = request.body.like;
                        // console.log("L", idToLike);
                        var RequestedImageArray = await database.collection('images').findOneAndUpdate({
                            '_id': ObjectId(idToLike)
                        }, {
                            $addToSet: {
                                "likers": {
                                    "_id": request.session.user_id
                                }
                            }
                        })


                        response.redirect('view-image?id=' + idToLike)

                    })
                }
            });
            app.post('/unlike', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        var idToLike = request.body.like;
                        // console.log(idToFollow);
                        var RequestedImageArray = await database.collection('images').findOneAndUpdate({
                            '_id': ObjectId(idToLike)
                        }, {
                            $pull: {
                                "likers": {
                                    "_id": request.session.user_id
                                }
                            }
                        })
                        response.redirect('view-image?id=' + idToLike)

                    })
                }
            })


            app.get('/delete-account', function (request, response) {
                getUser(request.session.user_id, function (user) {
                    response.render('delete-account', {
                        'isLogin': true,
                        'query': request.query,
                        'user': user
                    })
                })
            });


            app.post('/delete-account', function (request, response) {
                var _id = request.session.user_id;
                if (request.session.user_id) {
                    getUser(request.session.user_id, function (user) {
                        database.collection('users').deleteOne({
                            '_id': ObjectId(_id)
                        }, function (error2, data) {
                            request.session.destroy();
                            response.redirect('login?message=account_deleted');
                        })
                    })
                }
            });


            // app.post('/change-profile', function (request, response) {
            //     if (request.session.user_id) {
            //         var formData = new formidable.IncomingForm();
            //         formData.maxFileSize = 1000 * 1024 * 1024;
            //         formData.parse(request, function (error1, fields, files) {
            //             var oldPath = files.image.path;
            //             var caption = fields.caption;

            //             var newPath = 'public/profile/' + new Date().getTime() + '-' + files.image.name;

            //             fileSystem.rename(oldPath, newPath, function (error2) {
            //                 getUser(request.session.user_id, function (user) {

            //                     // console.log(user+'uploimg')
            //                     delete user.password;
            //                     var currentTime = new Date().getTime();

            //                     database.collection('users').updateOne({
            //                         '_id': ObjectId(request.session.user_id)
            //                     }, {
            //                         $set: { 'profile': newPath }
            //                     }, function (error2, data) {
            //                         response.redirect('/view-profile?id=' + request.session.user_id);
            //                     })
            //                 })
            //             })
            //         })
            //     }
            // })


            app.post('/change-profile', function (request, response) {
                if (request.session.user_id) {
                    var formData = new formidable.IncomingForm();
                    formData.maxFileSize = 1000 * 1024 * 1024;
                    formData.parse(request, function (error1, fields, files) {
                        // var oldPath = files.image.path;
                        // var caption = fields.caption;
                        getUser(request.session.user_id, function (user) {
                            // var oldPath = files.image.path;
                            var caption = fields.caption;
                            var oldpath = files.image.path;
                            var img = fileSystem.readFileSync(oldpath);
                            var publicid;
                            var iurl;
                            cloudinary.uploader.upload(oldpath, function (result) {
                                // console.log(result)
                                for (var attributename in result) {
                                    if (attributename == 'public_id') {
                                        publicid = result[attributename]
                                    }
                                    if (attributename == 'url') {
                                        iurl = result[attributename]
                                    }
                                }
                                var currentTime = new Date().getTime();
                                delete user.password;
                                // mongoClient.connect(process.env.DATABASE, function(err, db) {
                                //   if (err) throw err;
                                //   var dbo = db.db("mydb");
                                // var myobj = {
                                //     // name:publicid ,
                                //     //  imageURl: iurl ,
                                //     'filePath': iurl,
                                //     'user': user,
                                //     'caption': caption,
                                //     'createdAt': currentTime,
                                //     'likers': [],
                                //     'comments': []
                                // }
                                database.collection('users').updateOne({
                                                '_id': ObjectId(request.session.user_id)
                                            }, {
                                                $set: { 'profile': iurl }
                                            }, function (error2, data) {
                                                response.redirect('/view-profile?id=' + request.session.user_id);
                                            })
                                // var mysort = { name: 1 };
                                // database.collection("images").find().sort(mysort).toArray(function (err, result) {
                                //     if (err) throw err;
                                //     console.log(result);
                                //     // db.close();
                                // });

                                // , function (error2, data) {
                                //     response.redirect('/?message=image_uploaded');
                                // }
                            });
                        });
                        // var newPath = 'public/profile/' + new Date().getTime() + '-' + files.image.name;

                        // fileSystem.rename(oldPath, newPath, function (error2) {
                        //     getUser(request.session.user_id, function (user) {

                        //         // console.log(user+'uploimg')
                        //         delete user.password;
                        //         var currentTime = new Date().getTime();

                        //         database.collection('users').updateOne({
                        //             '_id': ObjectId(request.session.user_id)
                        //         }, {
                        //             $set: { 'profile': newPath }
                        //         }, function (error2, data) {
                        //             response.redirect('/view-profile?id=' + request.session.user_id);
                        //         })
                        //     })
                        // })
                    })
                }
            })

            app.get('/settings', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        var userDetails = await database.collection('users').findOne({
                            '_id': ObjectId(request.session.user_id)
                        })

                        // console.log(userDetails)
                        response.render('settings', {
                            'isLogin': true,
                            'query': request.query,
                            'user': user
                        });
                    })
                }
            })


            app.post('/update-details', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        var userDetails = await database.collection('users').updateOne({
                            '_id': ObjectId(request.session.user_id)
                        }, {
                            $set: { name: request.body.name, email: request.body.email }
                        })
                        response.redirect('settings?message=details_updated');
                        //console.log(userDetails)
                    })


                }
            })


            app.post('/change-password', function (request, response) {
                if (request.session.user_id) {
                    getUser(request.session.user_id, async function (user) {
                        if (request.body.password != request.body.confirm_password) {
                            response.redirect('/settings?error=mismatch');
                            return;
                        }
                        var current_password = request.body.current_password;
                        database.collection('users').findOne({
                            '_id': ObjectId(request.session.user_id)
                        }, function (error1, user) {
                            bcrypt.compare(current_password, user.password, function (error2, isPasswordVerify) {
                                if (isPasswordVerify) {
                                    bcrypt.hash(request.body.password, 10, function (error3, hash) {
                                        database.collection('users').updateOne({
                                            '_id': ObjectId(request.session.user_id)
                                        }, {
                                            $set: { 'password': hash }
                                        });
                                    });
                                    response.redirect('settings?message=password_updated')
                                } else {
                                    response.redirect('settings?error=wrong_password')
                                }
                            });

                        })

                    })
                }
            });
        });





});



