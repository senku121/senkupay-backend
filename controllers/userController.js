/*==================================================
                SENKU PAY
            USER CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        USER PROFILE
==================================*/

exports.getProfile = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({

            where: {

                id: req.user.id

            }

        });

        if (!user) {

            return res.status(404).json({

                success: false,

                message: "User not found."

            });

        }

        return res.status(200).json({

            success: true,

            profile: {

                id: user.id,

                username: user.username,

                email: user.email,

                firstName: user.firstName,

                lastName: user.lastName,

                phone: user.phone,

                country: user.country,
                emailVerified: user.emailVerified,

                balance: user.balance,

                deposited: user.deposited,

                withdrawn: user.withdrawn,

                lockedBalance: user.lockedBalance,

                status: user.status,

                createdAt: user.createdAt

            }

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load profile."

        });

    }

};