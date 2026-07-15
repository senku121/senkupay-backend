/*==================================================
                SENKU PAY
            ADMIN CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        GET WITHDRAW REQUESTS
==================================*/

exports.getWithdrawRequests = async (req, res) => {

    try {

        const requests =
        await prisma.withdrawRequest.findMany({

            include:{
                user:true
            },

            orderBy:{
                createdAt:"desc"
            }

        });

        return res.status(200).json({

            success:true,

            requests

        });

    }

    catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:"Unable to load withdrawal requests."

        });

    }

};


/*==================================
        APPROVE WITHDRAW
==================================*/

exports.approveWithdraw = async (req,res)=>{

    try{

        const { id } = req.params;

        const request =
        await prisma.withdrawRequest.findUnique({

            where:{ id }

        });

        if(!request){

            return res.status(404).json({

                success:false,

                message:"Withdrawal request not found."

            });

        }

        if(request.status!=="Pending"){

            return res.status(400).json({

                success:false,

                message:"Withdrawal request already processed."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where:{
                    id:request.userId
                },

                data:{

                    lockedBalance:{
                        decrement:request.amount
                    },

                    withdrawn:{
                        increment:request.amount
                    }

                }

            }),

            prisma.withdrawRequest.update({

                where:{ id },

                data:{
                    status:"Approved"
                }

            }),

            prisma.transaction.updateMany({

                where:{

                    userId:request.userId,

                    type:"Withdrawal",

                    amount:request.amount,

                    status:"Pending"

                },

                data:{
                    status:"Approved"
                }

            })

        ]);

        return res.status(200).json({

            success:true,

            message:"Withdrawal approved successfully."

        });

    }

    catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:"Unable to approve withdrawal."

        });

    }

};


/*==================================
        REJECT WITHDRAW
==================================*/

exports.rejectWithdraw = async (req,res)=>{

    try{

        const { id } = req.params;

        const request =
        await prisma.withdrawRequest.findUnique({

            where:{ id }

        });

        if(!request){

            return res.status(404).json({

                success:false,

                message:"Withdrawal request not found."

            });

        }

        if(request.status!=="Pending"){

            return res.status(400).json({

                success:false,

                message:"Withdrawal request already processed."

            });

        }

        await prisma.$transaction([

            prisma.user.update({

                where:{
                    id:request.userId
                },

                data:{

                    balance:{
                        increment:request.amount
                    },

                    lockedBalance:{
                        decrement:request.amount
                    }

                }

            }),

            prisma.withdrawRequest.update({

                where:{ id },

                data:{
                    status:"Rejected"
                }

            }),

            prisma.transaction.updateMany({

                where:{

                    userId:request.userId,

                    type:"Withdrawal",

                    amount:request.amount,

                    status:"Pending"

                },

                data:{
                    status:"Rejected"
                }

            })

        ]);

        return res.status(200).json({

            success:true,

            message:"Withdrawal rejected successfully."

        });

    }

    catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:"Unable to reject withdrawal."

        });

    }

};