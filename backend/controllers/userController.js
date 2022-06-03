import asyncHandler from "express-async-handler";
import generateToken from "../utils/generateToken.js";
import User from "../models/userModel.js";
import { variables } from "../server.js";
import {getUserFollowingData, getUserTweetsData} from "../utils/functions.js";
// @desc    Get user profile
// @route   Get /api/users/profile
// @access  Private
const get = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  if (user) {
    res.json(user);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    create user
// @route   post /api/users
// @access  public
const create = asyncHandler(async (req, res) => {
  const user = await User.create(req.body);
  const createdUser = await user.save();
  // Check if req.query has referredBy eg. /api/users?referredBy=5f4b8f8f5f4b8f8f5f4b8f8f
  if (req.query.referredby) {
    // Find the user who referred the user by the id
    const userExists = await User.findById(req.query.referredby);
    // checking if the user who invited exists
    if (userExists) {
      // Giving 1 arcade point to the user who referred the user
      userExists.arcadePoint += 1;
      userExists.save();
      // Giving 1 arcade point to the user who joined using invite link
      createdUser.arcadePoint += 1;
      createdUser.save();
    }
  }
  // if user is created successfully
  res.status(201).res.json(createdUser);
});

// @desc    Update user profile
// @route   patch /api/users
// @access  Private
const patch = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    user.username = req.body.username || user.username;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    verify discord
// @route   patch /api/users/verifyDiscord
// @access  Private
const verifyDiscord = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    // Step 1: Make a request to Discord's API to get the user's server list
    fetch(`https://discordapp.com/api/users/@me/guilds`, {
      headers: {
        Authorization: `Bearer ${req.body.token}`,
      },
    })
      .then((res) => res.json())
      .then((res) => {
        // Step 2: Check if our server is in the user's server
        const guilds = res.map((guild) => guild.id);

        const SERVER = variables.server;
        const isInGuild = guilds.includes(SERVER);
        if (isInGuild) {
          // Step 3: If we are in the server, get the user's info
          fetch(
            `https://discordapp.com/api/users/@me/guilds/${SERVER}/member`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )
            .then((res) => res.json())
            .then((res) => {
              // Step 4: Check if the user has a role in our server
              const roles = res.roles;
              const ROLE = variables.role;
              const hasRole = roles.includes(ROLE);
              if (hasRole) {
                // Step 5: If the user has the role, update in the database
                user.verifiedInDiscord = true;
                user.arcadePoint += 1;
                const updatedUser = await user.save();
                res.json(updatedUser);
              } else {
                res.status(401);
                throw new Error("You don't have the role!");
              }
            });
        } else {
          // return 401 if the user is not in the server
          res.status(401);
          throw new Error("You are not in the server!");
        }
      })
      .catch((error) => {
        console.log(error);
      });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});
// @desc    twitter followed
// @route   patch /api/users/twitterFollowed
// @access  Private
const twitterFollowed = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    if (user.twitterFollowed.includes(req.body.twitterFollowed)) {
      res.status(400);
      throw new Error("User already followed");
    }


    let pagination_token = null;
    let shouldRun;
    do {
      try {
        shouldRun = false;
        const data = await getUserFollowingData(user, pagination_token);
        // eslint-disable-next-line
        const isFollowing = data.data.some((user) => user.id == req.body.twitterFollowed);
        if (isFollowing) {
          user.twitterFollowed = [...user.twitterFollowed, req.body.twitterFollowed];
          user.arcadePoint += 1;
      
          const updatedUser = await user.save();
          res.json(updatedUser);
        } else {
          if (data.meta && data.meta.next_token) {
            pagination_token = data.meta.next_token;
            shouldRun = true;
          } else {
            res.status(400);
            throw new Error("Please try again! You havent followed");
          }
        }
      } catch (error) {
        res.status(400)
        throw new Error(error)
      }
    } while (shouldRun);

  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    twitter followed
// @route   patch /api/users/twitterRetweeted
// @access  Private
const twitterRetweeted = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    if (user.twitterRetweeted.includes(req.body.twitterRetweeted)) {
      res.status(400);
      throw new Error("User already retweeted this specific tweet");
    }


    let pagination_token = null;
    let shouldRun = false;
    do {
      try {
        shouldRun = false;
        const data = await getUserTweetsData(req.body.user, pagination_token);

        const filteredData = data.data.filter((data) => {
          return data.referenced_tweets
            ? data.referenced_tweets.some((tweet) => tweet.id === req.body.twitterRetweeted)
            : false;
        });

        console.log("filteredData", filteredData);

        const hasRetweetedTweet = filteredData.length > 0;
        if (hasRetweetedTweet) {
          user.twitterRetweeted = [
            ...user.twitterRetweeted,
            req.body.twitterRetweeted,
          ];
          user.arcadePoint += 1;
      
          const updatedUser = await user.save();
          res.json(updatedUser);
        } else {
          if (data.meta && data.meta.next_token) {
            pagination_token = data.meta.next_token;
            shouldRun = true;
          } else {
            res.status(400);
            throw new Error("Please try again! You havent retweeted this specific tweet");
          }
        }
      } catch (error) {
        res.status(400)
        throw new Error(error)
      }
    } while (shouldRun);

 
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    twitter tweeted specific handle
// @route   patch /api/users/twitterFollowed
// @access  Private
const twitterTweetedHandle = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user) {
    if (user.twitterTweetedHandle.includes(req.body.tweetedHandle)) {
      res.status(400);
      throw new Error("User already tweeted this specific handle");
    }

    let pagination_token = null;
    let shouldRun = false;
    do {
      try {
        shouldRun = false;
        const data = await getUserTweetsData(req.body.user, pagination_token);

        const filteredData = data.data.filter((data) => {
          return !data.entities
            ? false
              ? data.entities.referenced_tweets
              : false
            : !data.entities.mentions
            ? false
            : data.entities.mentions.some(
                (mention) => mention.username === req.body.tweetedHandle
              );
        });

        const hasRetweetedHandle = filteredData.length > 0;
        if (hasRetweetedHandle) {
          user.twitterTweetedHandle = [
            ...user.twitterTweetedHandle,
            req.body.tweetedHandle,
          ];
          user.arcadePoint += 1;
      
          const updatedUser = await user.save();
          res.json(updatedUser);
        } else {
          if (data.meta && data.meta.next_token) {
            pagination_token = data.meta.next_token;
            shouldRun = true;
          } else {
            res.status(400);
            throw new Error("Please try again! You havent tweeted this specific handle");
          }
        }
      } catch (error) {
        res.status(400)
        throw new Error(error)
      }
    } while (shouldRun);
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Get all users
// @route   Get /api/users
// @access  Public
const find = asyncHandler(async (req, res) => {
  // If a query string ?publicAddress=... is given, then filter results
  const whereClause =
    req.query && req.query.publicAddress
      ? {
          publicAddress: req.query.publicAddress,
        }
      : {};

  const users = await User.find(whereClause);
  res.json(users);
});

export {
  find,
  get,
  create,
  patch,
  verifyDiscord,
  twitterFollowed,
  twitterRetweeted,
  twitterTweetedHandle,
};
