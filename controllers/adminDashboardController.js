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
            userBalanceResult,
            admin,
            pendingWithdraw,
            completedDeposits,
            completedWithdraws
        ] = await Promise.all([
            // Total registered users
            prisma.user.count(),

            // Total registered agents
            prisma.agent.count(),

            // Total transactions
            prisma.transaction.count(),

            // Combined balance of every user
            prisma.user.aggregate({
                _sum: {
                    balance: true
                }
            }),

            // Platform/admin balance
            // Do not filter by status because the Platform Withdraw
            // page currently uses the first admin record.
            prisma.admin.findFirst({
                select: {
                    balance: true
                }
            }),

            // Pending withdrawal amount
            prisma.withdrawRequest.aggregate({
                _sum: {
                    amount: true
                },
                where: {
                    status: "Pending"
                }
            }),

            // Completed deposits
            prisma.transaction.aggregate({
                _sum: {
                    amount: true
                },
                where: {
                    type: "Deposit",
                    status: "Completed"
                }
            }),

            // Completed withdrawals
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

        // Combined balance of all users
        const totalBalance = Number(
            userBalanceResult._sum.balance || 0
        );

        // Real platform treasury balance
        const adminBalance = Number(
            admin?.balance || 0
        );

        return res.status(200).json({
            success: true,

            dashboard: {
                totalUsers,
                totalAgents,
                totalTransactions,

                // Total of all user wallets
                totalBalance,

                // Platform/admin treasury
                adminBalance,

                pendingWithdraw: Number(
                    pendingWithdraw._sum.amount || 0
                ),

                // Your frontend looks for todayDeposits
                todayDeposits: Number(
                    completedDeposits._sum.amount || 0
                ),

                totalDeposits: Number(
                    completedDeposits._sum.amount || 0
                ),

                totalWithdraws: Number(
                    completedWithdraws._sum.amount || 0
                )
            }
        });
    } catch (error) {
        console.error("Dashboard error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to load dashboard."
        });
    }
};