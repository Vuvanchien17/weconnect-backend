import mongoose from "mongoose";

async function connect_MongoDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connection MongoDB successful!");
  } catch (error) {
    console.log("MongoDB connection failed: ", error);
    process.exit(1);
  }
}

export default connect_MongoDB;
