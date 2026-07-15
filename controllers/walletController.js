/*==================================================
                SENKU PAY
            WALLET CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        GET WALLET
==================================*/

exports.getWallet = async (req, res) => {

    try {

        const user = await prisma.user.findUnique({

            where: {

                id: req.user.id

            },

            select: {

                id: true,

                username: true,

                email: true,

                firstName: true,

                lastName: true,
                emailVerified: true,

                balance: true,

                deposited: true,

                withdrawn: true,

                lockedBalance: true,

                status: true,

                createdAt: true

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

            wallet: user

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load wallet."

        });

    }

};