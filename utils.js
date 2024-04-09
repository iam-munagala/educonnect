require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    ssl: {
      rejectUnauthorized: true,
    }
  });

const generateUserId = async () => {
  try {
    const result = await pool.query('SELECT userid FROM users ORDER BY userid DESC LIMIT 1');
    if (result.rows.length > 0) {
      const lastUserId = result.rows[0].userid;
      const numericPart = parseInt(lastUserId.substring(3)) + 1; 
      return `UID${numericPart}`;
    } else {
      return 'UID100';
    }
  } catch (error) {
    console.error('Error generating user ID:', error);
    throw error; 
  }
};

const getDetails = async (userId, role) => {
  let queryText;
  if (role === 'admin') {
    queryText = 'SELECT * FROM admins WHERE adminid = $1';
  } else if (role === 'student') {
    queryText = 'SELECT * FROM users WHERE userid = $1';
  } else {
    throw new Error('Invalid role specified');
  }

  try {
    const { rows } = await pool.query(queryText, [userId]);
    if (rows.length > 0) {
      return rows[0]; 
    } else {
      return null; 
    }
  } catch (error) {
    console.error('Error retrieving user details:', error);
    throw error; 
  }
};


const generateCourseId = async () => {
  try {
    const result = await pool.query('SELECT courseid FROM courses ORDER BY courseid DESC LIMIT 1');
    if (result.rows.length > 0) {
      const lastCourseId = result.rows[0].courseid;
      const numericPart = parseInt(lastCourseId.substring(3)) + 1;
      return `CID${numericPart}`; 
    } else {
      return 'CID100'; 
    }
  } catch (error) {
    console.error('Error generating course ID:', error);
    throw error;
  }
};

const generateEnrollId = async (pool) => {
  try {
    const result = await pool.query('SELECT enrollid FROM course_enrollments ORDER BY enrollid DESC LIMIT 1');
    if (result.rows.length > 0) {
      const lastEnrollId = result.rows[0].enrollid;
      const numericPart = parseInt(lastEnrollId.substring(3)) + 1;
      return `EID${numericPart}`;
    } else {
      return 'EID100';
    }
  } catch (error) {
    console.error('Error generating enroll ID:', error);
    throw new Error('Error generating enroll ID');
  }
};


module.exports = {
  generateUserId,
  pool,
  getDetails,
  generateCourseId,
  generateEnrollId,
};
