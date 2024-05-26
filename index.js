const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken')
const cookieParser =  require('cookie-parser')
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const port = process.env.PORT || 5000

//------ middlewere ----
const corsOptions = {
    origin:['http://localhost:5173' ,
    'https://solosphere-4e1d0.web.app','https://solosphere-4e1d0.firebaseapp.com'],
    credentials:true,
    optionSuccessStatus:200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

 // verify jwt  middlewere
 const verifyToken = (req,res,next) => {
    const token = req.cookies?.token
        // console.log(token)
        if(!token) return res.status(401).send({message:'unauthorized access'})
        if(token) {
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if(err){
                   return  res.status(401).send({message:'unauthorized access'})
                }
                // console.log(decoded, 'decoded')
                req.user = decoded 
                next()
            })
        } 
 }
 
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ot34xl4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
     const jobsCollection = client.db('solosphere').collection('jobs')
     const bidsCollection = client.db('solosphere').collection('bids')
     
     // jwt genarate
     app.post('/jwt', async (req, res) => {
        const user = req.body
        const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{expiresIn:'365d'})
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
        }).send({success: true})
     })

     // clear token on logout
     app.get('/logout', (req,res) => {
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge:0,
        }).send({success: true})
     })

    // get all jobs data from db
    app.get('/jobs', async (req,res) => {
        const result = await jobsCollection.find().toArray()
        res.send(result)
    })

    // save bids data in bidsCollection 
    app.post('/bid', async(req,res) => {
        const bidData = req.body
        const query = {
            email : bidData.email,
            jobId : bidData.jobId
        }
        const alreadyApplied = await bidsCollection.findOne(query) 
         if(alreadyApplied) {
            return res.status(404).send('you have already place bid this job')
         }
        const result = await bidsCollection.insertOne(bidData)
        // update bit count
        const updateDoc = {
            $inc:{bid_count:1}
        }
        const jobQuery = {_id: new ObjectId(bidData.jobId)}
        const updateBitCount = await jobsCollection.updateOne(jobQuery, updateDoc)
        console.log(updateBitCount)
        
        res.send(result)
    })

    // save job data in jobsCollection 
    app.post('/jobs', async(req,res) => {
        const jobData = req.body
        const result = await jobsCollection.insertOne(jobData)
        res.send(result)
    })

    // get a specific jobs data from db
    app.get('/jobs/:id', async (req,res) => {
        const id = req.params.id
        const query = {_id: new ObjectId(id)}
        const result = await jobsCollection.findOne(query)
        res.send(result)
    }) 

    // delete a job data 
    app.delete('/jobs/:id', async (req,res) => {
        const id = req.params.id
        const query = {_id : new ObjectId(id)}
        const result = await jobsCollection.deleteOne(query)
        res.send(result)
    })

    // update job data in db 
    app.put('/jobs/:id',  async (req, res) => {
        const id = req.params.id
        const jobData = req.body
        const query = {_id : new ObjectId(id)}
        const option = {upsert:true}
        const updateDoc = {
            $set:{
                ...jobData
            }
        }
        const result = await jobsCollection.updateOne(query, updateDoc, option)
        res.send(result)
    })

    // get jobs data by email from db
    app.get('/job/:email', verifyToken, async (req,res) => {
        const tokenEmail = req.user.email 
        const email = req.params.email
        if(tokenEmail !== email) {
            return res.status(403).send({message:'forbidden access'})
        }
        const query = {'byers.email' : email}
        const result = await jobsCollection.find(query).toArray()
        res.send(result) 
    })

     // get bids data by email from db
     app.get('/my-bids/:email', verifyToken, async (req,res) => {
        const tokenEmail = req.user.email 
        const email = req.params.email
        if(tokenEmail !== email) {
            return res.status(403).send({message:'forbidden access'})
        }
        const query = {email}
        const result = await bidsCollection.find(query).toArray()
        res.send(result) 
    })


    // get all bid request from db for owener
    app.get('/bid-request/:email', verifyToken, async (req,res) => {
        const tokenEmail = req.user.email 
        const email = req.params.email
        if(tokenEmail !== email) {
            return res.status(403).send({message:'forbidden access'})
        }
        const query = { 'byers.email' : email}
        const result = await bidsCollection.find(query).toArray()
        res.send(result) 
    })

    // update bit status 
    app.patch('/bid/:id', async (req, res) => {
        const id = req.params.id
        const status = req.body
        const query = {_id : new ObjectId(id)}
        const updateDoc = {
            $set : status
        }
        const result = await bidsCollection.updateOne(query, updateDoc)
        res.send(result)
    })

    // for pagination
    // get all jobs data from db
    app.get('/all-jobs', async (req,res) => {
        const page =  parseInt(req.query.page) - 1
        const size =  parseInt(req.query.size)
        const filter = req.query.filter 
        const sort = req.query.sort
        const search = req.query.search
        // console.log(search)
        //  
        let query = {
            jobTitle: { $regex: search, $options: 'i' },
        }
        if(filter) query.category = filter
        let option = {}
        if(sort) option = {sort: {deadline : sort === 'asc' ? 1 : -1}}
        const result = await jobsCollection.find(query,option).skip(page * size).limit(size).toArray()
        res.send(result)
    })

    // get all jobs data from db
    app.get('/jobs-count', async (req,res) => {
        const filter = req.query.filter 
        const search = req.query.search
        let query = {
            jobTitle: { $regex: search, $options: 'i' },
        }
        if(filter) query.category = filter
        const count = await jobsCollection.countDocuments(query)
        res.send({count})
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
     
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('We are going to make an Solosphere website.')
})

app.listen(port, () => {
    console.log(`Solosphere website running on port ${port}`)
})