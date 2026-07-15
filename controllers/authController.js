const {generateOTP}=require("../utils/generateOTP");

const {sendOTPEmail}=require("../services/otpService");

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const prisma = new PrismaClient();


// ================= REGISTER =================

exports.register = async (req, res) => {

    try{

        const{

            username,
            email,
            password,
            firstName,
            lastName

        } = req.body;

        const existingUser = await prisma.user.findFirst({

            where:{
                OR:[
                    {username},
                    {email}
                ]
            }

        });

        if(existingUser){

            return res.status(400).json({

                message:"Username or Email already exists"

            });

        }

        const hashedPassword =
        await bcrypt.hash(password,10);

        const otp = generateOTP();

        const otpExpiry =
        new Date(Date.now()+10*60*1000);

        await prisma.user.create({

            data:{

                username,
                email,
                password:hashedPassword,
                firstName,
                lastName,

                emailVerified:false,
                otp,
                otpExpiry

            }

        });

        await sendOTPEmail(email,otp);

        return res.status(200).json({

            success:true,
            message:"Verification code sent to your email."

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            message:"Server error"

        });

    }

};


// ================= LOGIN =================

exports.login = async (req, res) => {

    try {

        const { username, password } = req.body;

        const user = await prisma.user.findFirst({

            where: {

                OR: [

                    { username },

                    { email: username }

                ]

            }

        });

        if (!user) {

            return res.status(400).json({
                message: "Invalid username or password"
            });

        }

        const match = await bcrypt.compare(
            password,
            user.password
        );

        if (!match) {

            return res.status(400).json({
                message: "Invalid username or password"
            });

        }
        if (!user.emailVerified) {

    return res.status(403).json({

        message: "Please verify your email before logging in."

    });

}

        const token = jwt.sign(

            {

                id: user.id,

                username: user.username,

                role: "USER"

            },

            process.env.JWT_SECRET,

            {

                expiresIn: "7d",
issuer: "senku-pay-api",
audience: "senku-pay-user"

            }

        );

        return res.status(200).json({

            message: "Login successful",

            token,

            user: {

                id: user.id,

                username: user.username,

                role: "USER"

            }

        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            error: "Server error"
        });

    }

};


// ================= CURRENT USER =================

exports.me = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({

            where: {
                id: req.user.id
            }

        });

        if (!user) {

            return res.status(404).json({
                message: "User not found"
            });

        }

        res.json({

            id: user.id,

            username: user.username,

            email: user.email,

            firstName: user.firstName,

            lastName: user.lastName,

            phone: user.phone,

            country: user.country,

            balance: user.balance,

            deposited: user.deposited,

            withdrawn: user.withdrawn,

            lockedBalance: user.lockedBalance,

            status: user.status,

            role: "USER"

        });

    } catch (error) {

        console.log(error);

        res.status(500).json({
            message: "Server error"
        });

    }

};
/*================= ADMIN LOGIN =================*/

exports.adminLogin = async (req, res) => {

    try {

        const { username, password } = req.body;

        const admin = await prisma.admin.findUnique({

            where: {
                username
            }

        });

        if (!admin) {

            return res.status(400).json({
                message: "Invalid username or password"
            });

        }

        const match = await bcrypt.compare(
            password,
            admin.password
        );

        if (!match) {

            return res.status(400).json({
                message: "Invalid username or password"
            });

        }

        const token = jwt.sign(

            {

                id: admin.id,

                username: admin.username,

                role: admin.role

            },

            process.env.JWT_SECRET,

            {

                expiresIn: "7d",
issuer: "senku-pay-api",
audience: "senku-pay-admin"

            }

        );

        return res.status(200).json({

            message: "Admin login successful",

            token,

            admin: {

                id: admin.id,

                username: admin.username,

                role: admin.role

            }

        });

    }

    catch (error) {

        console.log(error);

        res.status(500).json({

            message: "Server error"

        });

    }

};
exports.verifyEmail = async (req, res) => {

    try {

        const {

            email,
            otp

        } = req.body;

        const user = await prisma.user.findUnique({

            where: {

                email

            }

        });

        if (!user) {

            return res.status(404).json({

                message: "User not found"

            });

        }

        if (user.emailVerified) {

            return res.status(200).json({

                message: "Email already verified."

            });

        }

        if (user.otp !== otp) {

            return res.status(400).json({

                message: "Invalid verification code."

            });

        }

        if (new Date() > user.otpExpiry) {

            return res.status(400).json({

                message: "Verification code expired."

            });

        }

        await prisma.user.update({

            where: {

                id: user.id

            },

            data: {

                emailVerified: true,

                otp: null,

                otpExpiry: null

            }

        });

        return res.status(200).json({

            message: "Email verified successfully."

        });

    }

    catch (err) {

        console.log(err);

        res.status(500).json({

            message: "Server error"

        });

    }

};


exports.resendOTP = async (req, res) => {

    try {

        const { email } = req.body;

        const user = await prisma.user.findUnique({

            where: { email }

        });

        if (!user) {

            return res.status(404).json({

                message: "User not found."

            });

        }

        if (user.emailVerified) {

            return res.status(400).json({

                message: "Email already verified."

            });

        }

        const otp = generateOTP();

        const expiry = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.user.update({

            where: {

                id: user.id

            },

            data: {

                otp,

                otpExpiry: expiry

            }

        });

        await sendOTPEmail(email, otp);

        return res.status(201).json({

    success:true,

    message:"Verification code sent successfully.",

    email

});

    }

    catch (err) {

        console.log(err);

        res.status(500).json({

            message: "Server error"

        });

    }

};
exports.forgotPassword = async (req, res) => {

    try {

        const { email } = req.body;

        const user = await prisma.user.findUnique({

            where: { email }

        });

        if (!user) {

            return res.status(404).json({

                message: "Email not found."

            });

        }

        const otp = generateOTP();

        const expiry = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.user.update({

            where: {

                id: user.id

            },

            data: {

                otp,

                otpExpiry: expiry

            }

        });

        await sendOTPEmail(email, otp);

        return res.status(200).json({

            message: "OTP sent successfully."

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            message:"Server error"

        });

    }

};
exports.verifyResetOTP = async (req, res) => {

    try {

        const { email, otp } = req.body;

        const user = await prisma.user.findUnique({

            where: {

                email

            }

        });

        if (!user) {

            return res.status(404).json({

                message: "User not found."

            });

        }

        if (user.otp !== otp) {

            return res.status(400).json({

                message: "Invalid OTP."

            });

        }

        if (new Date() > user.otpExpiry) {

            return res.status(400).json({

                message: "OTP expired."

            });

        }

        return res.status(200).json({

            message: "OTP verified."

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            message:"Server error"

        });

    }

};
exports.resetPassword = async (req, res) => {

    try {

        const {

            email,
            password

        } = req.body;

        const user = await prisma.user.findUnique({

            where: {

                email

            }

        });

        if (!user) {

            return res.status(404).json({

                message: "User not found."

            });

        }

        const hashedPassword = await bcrypt.hash(

            password,

            10

        );

        await prisma.user.update({

            where: {

                id: user.id

            },

            data: {

                password: hashedPassword,

                otp: null,

                otpExpiry: null

            }

        });

        return res.status(200).json({

            message: "Password updated successfully."

        });

    }

    catch(err){

        console.log(err);

        res.status(500).json({

            message:"Server error"

        });

    }

};