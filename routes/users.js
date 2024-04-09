const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { pool } = require('../utils');
const {getDetails} = require('../utils');
const {generateEnrollId} = require('../utils');
require('dotenv').config();
const { Resend } = require('resend');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');


const resend = new Resend('re_hN6mMtxn_Guu7tcNMEv1mEM96FfQzj1Y4');

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(403).send({ message: 'No token provided.' });
  
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(500).send({ message: 'Failed to authenticate token.' });
      req.userId = decoded.userId; 
      req.role = decoded.role; 
      next();
    });
  };

  
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  folder: "educonnect_profiles",
  allowedFormats: ["jpg", "png", "jpeg"],
});

const parser = multer({ storage: storage });

  router.get('/get-unenrolled-courses', verifyToken, async (req, res) => {
    try {
      const userDetails = await getDetails(req.userId, req.role);
      const userLevel = userDetails.semester;
      const unenrolledCourses = await pool.query(`
        SELECT * FROM courses 
        WHERE level = $1 
        AND courseid NOT IN (
          SELECT courseid FROM course_enrollments WHERE userid = $2
        )
        ORDER BY popularity DESC
      `, [userLevel, userDetails.userid]);
      
      res.json({
        courses: unenrolledCourses.rows,
        userDetails 
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server error');
    }
  });
  
  router.post('/enroll-course', verifyToken, async (req, res) => {
    const { courseId,coursename } = req.body; 
    try {
      const userDetails = await getDetails(req.userId, req.role);
      if (!userDetails) {
        return res.status(404).send('User not found');
      }
      
      const enrollId = await generateEnrollId(pool);

      await pool.query(
        'INSERT INTO course_enrollments (enrollid, userid, courseid) VALUES ($1, $2, $3)',
        [enrollId, userDetails.userid, courseId]
      );

      const response = await resend.emails.send({
        from: 'Acme <onboarding@resend.dev>',
        to: userDetails.email,
        subject: 'Course Registration Confirmation - EduConnect',
        html: `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 20px;
        background-color: #f4f4f4;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: auto;
        background: #fff;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      h1 {
        color: #0056b3;
      }
    </style>
    </head>
    <body>
    <div class="container">
      <h1>Course Registration Successful</h1>
      <p>Dear ${userDetails.name},</p>
      <p>Congratulations! You have successfully registered for the course "${coursename}" on EduConnect.</p>
      <p>We wish you an enriching learning experience. Should you have any questions or require assistance, please do not hesitate to contact us.</p>
      <p>Best Regards,<br>EduConnect Team</p>
    </div>
    </body>
    </html>
    `
    });    
  
      res.send({ message: 'Successfully enrolled in the course' });
    } catch (error) {
      console.error('Error enrolling in course:', error.message || error);
      res.status(500).send('Error enrolling in course');
    }
  });

  router.get('/enrolled-courses', verifyToken, async (req, res) => {
    const userId = req.userId;
    try {
      const enrolledCourses = await pool.query(`
        SELECT ce.enrollid, c.courseid, c.coursename, c.category, c.level
        FROM course_enrollments ce
        INNER JOIN courses c ON ce.courseid = c.courseid
        WHERE ce.userid = $1
        ORDER BY ce.enrollment_date DESC
      `, [userId]);
      res.json(enrolledCourses.rows);
    } catch (error) {
      console.error('Failed to fetch enrolled courses:', error.message);
      res.status(500).send('Server error while fetching enrolled courses');
    }
  });
  
  router.delete('/unenroll-course/:enrollId', verifyToken, async (req, res) => {
    const { enrollId } = req.params; 
    const userId = req.userId; 
    try {
      const enrollmentCheck = await pool.query(
        'SELECT * FROM course_enrollments WHERE enrollid = $1 AND userid = $2',
        [enrollId, userId]
      );
  
      if (enrollmentCheck.rows.length === 0) {     
        return res.status(404).json({ message: 'Enrollment record not found or does not belong to the user.' });
      } 
      await pool.query(
        'DELETE FROM course_enrollments WHERE enrollid = $1',
        [enrollId]
      );
  
      res.json({ message: 'Successfully unenrolled from the course.' });
    } catch (error) {
      console.error('Error unenrolling from the course:', error);
      res.status(500).json({ message: 'Failed to unenroll from the course.' });
    }
  });

  router.post('/update-profile',verifyToken,parser.single('image'), async (req, res) => {
    const { name, email, semester } = req.body;
    const userid = req.userId; 
    const newImage = req.file ? req.file.path : null;
  
    try {
      const userResult = await pool.query('SELECT * FROM users WHERE userid = $1', [userid]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: "User not found." });
      }
  
      const currentUser = userResult.rows[0];
  
      if (newImage && currentUser.profile_picture_url) {
        const publicId = currentUser.profile_picture_url.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      }
      const updateQuery = `
        UPDATE users SET name = $1, email = $2, semester = $3, profile_picture_url = $4
        WHERE userid = $5 RETURNING *`;
      const updatedUser = await pool.query(updateQuery, [name, email, semester, newImage || currentUser.profile_picture_url, userid]);
  
      res.json({ message: "Profile updated successfully", user: updatedUser.rows[0] });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile." });
    }
  });

  module.exports = router;