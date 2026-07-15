/*==================================================
                SENKU PAY
        TRANSACTIONS CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        USER TRANSACTIONS
==================================*/

exports.getTransactions = async (req, res) => {

    try {

        const {

            page = 1,

            limit = 20,

            type,

            status

        } = req.query;

        const where = {

            userId: req.user.id

        };

        if (type) {

            where.type = type;

        }

        if (status) {

            where.status = status;

        }

        const skip =

            (Number(page) - 1) *

            Number(limit);

        const [

            total,

            transactions

        ] = await Promise.all([

            prisma.transaction.count({

                where

            }),

            prisma.transaction.findMany({

                where,

                skip,

                take: Number(limit),

                orderBy: {

                    createdAt: "desc"

                }

            })

        ]);

        return res.status(200).json({

            success: true,

            total,

            page: Number(page),

            pages: Math.ceil(

                total /

                Number(limit)

            ),

            transactions

        });

    }

    catch (error) {

        console.error(error);

        return res.status(500).json({

            success: false,

            message: "Unable to load transactions."

        });

    }

};