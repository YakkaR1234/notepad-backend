require("dotenv").config();

const config = require("./config.json");
const mongoose = require("mongoose");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { authenticateToken } = require("./Utilities");

mongoose.connect(config.connectionString, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Failed to connect to MongoDB', err));

const User = require("./models/user.model");
const Note = require("./models/note.model");

const app = express();
app.use(express.json());
// app.use(cors({ origin: "*" }));
const corsOptions ={
    origin:'*', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200,
 }
 
 app.use(cors(corsOptions)) 
 app.use(cors())

// Create account
app.post("/create-account", async (req, res) => {
    const { fullName, email, password } = req.body;

    if (!fullName) {
        return res.status(400).json({ error: true, message: "Full name is required" });
    }
    if (!email) {
        return res.status(400).json({ error: true, message: "Email is required" });
    }
    if (!password) {
        return res.status(400).json({ error: true, message: "Password is required" });
    }

    const isUser = await User.findOne({ email: email });

    if (isUser) {
        return res.json({ error: true, message: "User already exists" });
    }

    const user = new User({ fullName, email, password });

    await user.save();

    const accessToken = jwt.sign({ user }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "30m" });

    return res.json({ error: false, user, accessToken, message: "Registration Successful" });
});

// Login
app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email) { return res.status(400).json({ message: "Email is required" }); }
    if (!password) { return res.status(400).json({ message: "Password is required" }); }

    const userInfo = await User.findOne({ email: email });

    if (!userInfo) { return res.status(400).json({ message: "User not found" }); }

    if (userInfo.email === email && userInfo.password === password) {
        const user = { user: userInfo };
        const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "3000m" });
        
        return res.json({ error: false, message: "Login Successful", email, accessToken });
    } else {
        return res.status(400).json({ error: true, message: "Invalid Credentials" });
    }
});

//get user
app.get("/get-user", authenticateToken, async (req, res) => {
    try {
        const { user } = req.user;
        console.log(req.user)

        const isUser = await User.findOne({ _id: user._id });

        if (!isUser) {
            return res.status(401).json({ message: "User not found" });
        }

        return res.json({
            user: {
                fullName: isUser.fullName,
                email: isUser.email,
                _id: isUser._id,
                createdOn: isUser.createdOn,
            },
            message: "User retrieved successfully",
        });
    } catch (error) {
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
});


// Add note
app.post("/add-note", authenticateToken, async (req, res) => {
    const { title, content, tags } = req.body;
    const user = req.user.user;

    if (!title) {
        return res.status(400).json({ error: true, message: "Title is required" });
    }
    if (!content) {
        return res.status(400).json({ error: true, message: "Content is required" });
    }

    try {
        const note = new Note({
            title,
            content,
            tags: tags || [],
            userId: user._id
        });

        await note.save();

        return res.json({ error: false, note, message: "Note added successfully" });
    } catch (error) {
        console.error("Internal Server Error:", error);
        return res.status(500).json({ error: true, message: "Internal server error" });
    }
});

app.put("/edit-note/:noteId", authenticateToken, async (req, res) => {

    const noteId=req.params.noteId;
    const {title,content,tags,isPinned}=req.body;
    const {user}=req.user;

    if(!title&&!content&&!tags){
        return res.status(400).json({error:true,message:"No changes provided"});
    }

    try{
        const note=await Note.findOne({_id:noteId,userId:user._id});
        
        if(!note){
            return res.status(404).json({error:true,message:"Note not founded"});
        }

        if(title) note.title=title;
        if(content) note.content=content;
        if(tags) note.tags=tags;
        if(isPinned) note.isPinned=isPinned;

        await note.save();

        return res.json({error:false,note,message:"note updated successfully"});

    }catch(error){
        return res.status(500).json({error:true,message:"Internal Server error"})
    }

});

app.get("/get-all-notes", authenticateToken, async (req, res) => {
    const { user } = req.user;
 
    try {
      const notes = await Note.find({ userId: user._id.toString() });
      return res.json({ error: false, notes, message: "All notes retrieved successfully" });
    } catch {
      return res.status(500).json({ error: true, message: "Internal server error" });
    }
  });



app.delete("/delete-note/:notesId", authenticateToken, async (req, res) => {

    const noteId=req.params.notesId;
    const {user}=req.user;

    try{
        const note=await Note.findOne({_id:noteId,userId:user._id});

        if(!note){
            return res.status(404).json({error:true,message:"Note not found"});
        }

        await Note.deleteOne({_id:noteId,userId:user._id});

        return res.json({error:false,message:"Note deleted succesfully"});
    }catch(error){
         return res.status(500).json({
            error:true,
            message:"Internal error",
         });
    }

});

//update ispinned
app.put("/update-note-pinned/:noteId", authenticateToken, async (req, res) => {
    const noteId=req.params.noteId;
    const {isPinned}=req.body;
    const {user}=req.user;



    try{
        const note=await Note.findOne({_id:noteId,userId:user._id});
        
        if(!note){
            return res.status(404).json({error:true,message:"Note not founded"});
        }

      
        note.isPinned=isPinned;

        await note.save();

        return res.json({error:false,note,message:"note updated successfully"});

    }catch(error){
        return res.status(500).json({error:true,message:"Internal Server error"})
    }

});

app.get("/search-notes/", authenticateToken, async (req, res) => {
    const {user} = req.user;
    const {query}=req.query;

    if (!query) {
        return res.status(400).json({
            error: true,
            message: "Search query is required"
        });
    }

    try {
        const matchingNotes = await Note.find({
            userId: user._id,
            $or: [
                { title: { $regex: new RegExp(query, "i") } },
                { content: { $regex: new RegExp(query, "i") } }
            ],
        });

        return res.json({
            error: false,
            notes: matchingNotes,
            message: "Notes matching the search query retrieved successfully"
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Internal Server Error"
        });
    }
});

app.get('/',(req,res)=>{
    res.send("Hello from server");
})


app.listen(9000, () => console.log('Server running on port 9000'));
module.exports = app;
