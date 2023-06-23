const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const UserSchema = new Schema(
  {
    name: { type: String },
    email: { type: String },
    password: { type: String },
    active: { type: Boolean },
    id: { type: String }
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', UserSchema);
