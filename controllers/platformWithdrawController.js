/*==================================================
                SENKU PAY
    PLATFORM WITHDRAW CONTROLLER
==================================================*/

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

/*==================================
        PLATFORM SUMMARY
==================================*/

exports.getPlatformWithdraw = async (req, res) => {

    try {

        const admin = await prisma.admin.findFirst();

        if (!admin) {

            return res.status(404).json({

                success:false,

                message:"Platform account not found."

            });

        }

        const history =
        await prisma.platformWithdraw.findMany({

            orderBy:{
                createdAt:"desc"
            }

        });

        const today = new Date();

        today.setHours(
            0,0,0,0
        );

        const todayWithdraw =

            history

            .filter(

                item=>

                new Date(item.createdAt)>=today

            )

            .reduce(

                (sum,item)=>

                sum+Number(item.amount),

                0

            );

        const totalWithdraw =

            history.reduce(

                (sum,item)=>

                sum+Number(item.amount),

                0

            );

        return res.status(200).json({

            success:true,

            platform:{

                balance:Number(admin.balance),

                todayWithdraw,

                totalWithdraw

            },

            history

        });

    }

    catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:"Unable to load platform withdrawals."

        });

    }

};


/*==================================
        CREATE PLATFORM WITHDRAW
==================================*/

exports.createPlatformWithdraw = async (req,res)=>{

    try{

        const {

            amount,

            method,

            destination,

            holder,

            note

        } = req.body;

        const withdrawAmount =
        Number(amount);

        if(

            isNaN(withdrawAmount)

            ||

            withdrawAmount<=0

        ){

            return res.status(400).json({

                success:false,

                message:"Invalid withdrawal amount."

            });

        }

        const admin =
        await prisma.admin.findFirst();

        if(!admin){

            return res.status(404).json({

                success:false,

                message:"Platform account not found."

            });

        }

        if(

            Number(admin.balance)

            <

            withdrawAmount

        ){

            return res.status(400).json({

                success:false,

                message:"Insufficient platform balance."

            });

        }

        await prisma.$transaction([

            prisma.admin.update({

                where:{
                    id:admin.id
                },

                data:{

                    balance:{
                        decrement:withdrawAmount
                    }

                }

            }),

            prisma.platformWithdraw.create({

    data: {

        adminId: admin.id,

        amount: withdrawAmount,

        method: String(
            method || "Manual"
        ).trim(),

        destination: String(
            destination || ""
        ).trim(),

        holder: String(
            holder || ""
        ).trim(),

        note: note
            ? String(note).trim()
            : null,

        status: "Completed"

    }

})

        ]);

        return res.status(201).json({

            success:true,

            message:"Platform withdrawal completed successfully."

        });

    }

    catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:"Unable to complete platform withdrawal."

        });

    }

};