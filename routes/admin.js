const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { pool } = require('../utils');
const {getDetails} = require('../utils');
const {generateCourseId} = require('../utils');

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


router.get('/courses', verifyToken, async (req, res) => {
  try {
    const allCourses = await pool.query('SELECT * FROM courses order by courseid');
    const userDetails  = await getDetails(req.userId,req.role);
    res.json({
        courses: allCourses.rows,
        userDetails 
      });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

router.post('/add-courses', verifyToken, async (req, res) => {
    const { coursename, category, level } = req.body;
  
    if (!coursename || !category || !level) {
      return res.status(400).send({ message: 'Missing required fields.' });
    }
  
    try {
      const courseId = await generateCourseId(); 
      const result = await pool.query(
        'INSERT INTO courses (courseid, coursename, category, level, popularity) VALUES ($1, $2, $3, $4, $5) RETURNING *;',
        [courseId, coursename, category, level, 0] 
      ); 
      res.status(201).json(result.rows[0]); 
    } catch (error) {
      console.error('Error adding course:', error);
      res.status(500).send({ message: 'Failed to add course.' });
    }
  });


router.delete('/delete-courses/:courseid', verifyToken, async (req, res) => {
  const { courseid } = req.params;
  
  try {
    const deleteResult = await pool.query(
      'DELETE FROM courses WHERE courseid = $1 RETURNING *;', [courseid]
    );

    if (deleteResult.rowCount > 0) {
      res.status(200).json({ message: 'Course successfully deleted.', deletedCourse: deleteResult.rows[0] });
    } else {
      res.status(404).send({ message: 'Course not found.' });
    }
  } catch (error) {
    console.error('Failed to delete course:', error);
    res.status(500).send({ message: 'Failed to delete course.' });
  }
});


router.put('/edit-courses/:courseid', verifyToken, async (req, res) => {
  const { courseid } = req.params;
  const { coursename, category, level } = req.body;
  
  if (!coursename || !category || !level) {
    return res.status(400).json({ message: "Please fill in all fields." });
  }

  try {
    const result = await pool.query(
      'UPDATE courses SET coursename = $1, category = $2, level = $3 WHERE courseid = $4 RETURNING *',
      [coursename, category, level, courseid]
    );

    if (result.rows.length > 0) {
      res.json({ message: 'Course successfully updated', course: result.rows[0] });
    } else {
      res.status(404).json({ message: 'Course not found' });
    }
  } catch (error) {
    console.error('Failed to update course:', error);
    res.status(500).json({ message: 'Failed to update course' });
  }
});


module.exports = router;
