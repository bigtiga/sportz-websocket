import express from "express";

const app = express();
const port = 8080;

app.use(express.json());
app.get("/", (req,res)=>{
    res.send(`hello from express server`);
});

app.listen(port, ()=>{
    console.log(`Server is running at http://localhost:${port}`);
})