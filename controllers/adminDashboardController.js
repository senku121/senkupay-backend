/*==================================================
                SENKU PAY
        ADMIN DASHBOARD CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        DASHBOARD
==================================*/

exports.getDashboard = async (req, res) => {

    try {

        const [

            totalUsers,

            totalAgents,

            totalTransactions,

            users,

            pendingWithdraw,

            completedDeposits,

            completedWithdraws

        ] = await Promise.all([

            prisma.user.count(),

            prisma.agent.count(),

            prisma.transaction.count(),

            prisma.user.findMany({

                select: {
                    balance: true
                }

            }),

            prisma.withdrawRequest.aggregate({

                _sum: {
                    amount: true
                },

                where: {
                    status: "Pending"
                }

            }),

            prisma.transaction.aggregate({

                _sum: {
                    amount: true
                },

                where: {

                    type: "Deposit",

                    status: "Completed"

                }

            }),

            prisma.transaction.aggregate({

                _sum: {
                    amount: true
                },

                where: {

                    type: "Withdraw",

                    status: "Completed"

                }

            })

        ]);

        const totalBalance = users.reduce(

            (sum, user) =>

                sum + Number(user.balance || 0),

            0

        );

        res.status(200).json({

            success: true,

            dashboard: {

                totalUsers,

                totalAgents,

                totalTransactions,

                totalBalance,

                pendingWithdraw:

                    pendingWithdraw._sum.amount || 0,

                totalDeposits:

                    completedDeposits._sum.amount || 0,

                totalWithdraws:

                    completedWithdraws._sum.amount || 0

            }

        });

    }

    catch (error) {

        console.error(

            "Dashboard error:",

            error

        );

        res.status(500).json({

            success: false,

            message:

                "Unable to load dashboard."

        });

    }

};