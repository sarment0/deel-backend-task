const express = require("express");
const bodyParser = require("body-parser");
const { sequelize } = require("./model");
const { getProfile } = require("./middleware/getProfile");
const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);
const { Op } = require("sequelize");
const { getJobsForUser } = require("./middleware/getJobs");
const { getContractsForUser } = require("./middleware/getContract");
const { QueryTypes } = require("sequelize");

//Return contract by Id (Fixed) :)
app.get("/contracts/:id", getProfile, getContractsForUser, async (req, res) => {
  const contractId = req.params.id;
  const contracts = req.contracts;
  console.log(contractId, contracts);

  try {
    const contract = contracts.find((c) => c.id == contractId);
    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }
    res.json(contract);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all contracts belonging to a user
app.get("/contracts", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const contracts = await Contract.findAll({
    where: {
      clientId: req.profile.id,
      status: { [Op.not]: "terminated" },
    },
  });
  if (!contracts) return res.status(400).end();
  res.json(contracts);
});

// Get all unpaid jobs for a user (**_either_** a client or contractor), for **_active contracts only_**.
app.get("/jobs/unpaid", getProfile, getJobsForUser, async (req, res) => {
  const jobs = req.jobs;
  res.json(jobs);
});

// Pay for a job, a client can only pay if his balance >= the amount to pay. The amount should be moved from the client's balance to the contractor balance.
app.post("/jobs/:job_id/pay", getProfile, getJobsForUser, async (req, res) => {
  const { Job, Profile, Contract } = req.app.get("models");
  const jobId = req.params.job_id;

  try {
    const t = await sequelize.transaction();
    const job = await Job.findOne({
      include: [
        {
          model: Contract,
          where: {
            ClientId: req.profile.id,
          },
        },
      ],
      where: {
        id: jobId,
      },
      transaction: t,
    });

    if (!job) {
      await t.rollback();
      return res.status(404).json({ error: "Job not found" });
    }
    // Check if the client who created the job is paying for it
    if (job.Contract.ClientId !== req.profile.id) {
      await t.rollback();
      return res
        .status(403)
        .json({ error: "You are not authorized to access this job" });
    }
    if (job.Contract === null) {
      await t.rollback();
      return res
        .status(403)
        .json({ error: "There is no Contract related to this job" });
    }
    const client = await Profile.findByPk(req.profile.id, { transaction: t });
    const contractor = await Profile.findByPk(job.Contract.ContractorId, {
      transaction: t,
    });
    const amountToPay = job.price;
    // Check if the client has enough balance to pay for the job
    if (client.balance >= amountToPay) {
      await client.update(
        { balance: client.balance - amountToPay },
        { transaction: t }
      );
      await contractor.update(
        { balance: contractor.balance + amountToPay },
        { transaction: t }
      );
      await job.update(
        {
          paid: true,
          paymentDate: new Date(),
        },
        { transaction: t }
      );
      await t.commit();
      res.status(200).json(job);
    } else {
      await t.rollback();
      res.status(400).json({ error: "Insufficient balance" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Deposits money into the the the balance of a client, a client can't deposit more than 25% his total of jobs to pay. (at the deposit moment)
app.post(
  "/balances/deposit/:userId",
  getProfile,
  getJobsForUser,
  async (req, res) => {
    const amount = parseInt(req.body.amount);
    const { Job, Contract, Profile } = req.app.get("models");
    const userId = req.params.userId;

    try {
      const checkIfUserExists = await Profile.findByPk(userId);
      console.log(checkIfUserExists);
      if (!checkIfUserExists) {
        return res.status(400).json({
          error: "Informed user does not exists.",
        });
      }
      const t = await sequelize.transaction();

      const jobsToPay = await Job.findAll({
        include: [
          {
            model: Contract,
            where: { ClientId: userId },
          },
        ],
        where: {
          paid: { [Op.or]: [null, false] },
        },
        transaction: t,
      });
      // Calculate the total amount needed to pay based on all the jobs in the array
      const totalAmount = jobsToPay.reduce(
        (acc, job) => acc + job.price - (job.paid || 0),
        0
      );

      // Calculate the maximum deposit allowed based on the 25% rule
      const maxDeposit = Math.ceil(totalAmount * 0.25);

      if (maxDeposit < amount) {
        await t.rollback();
        return res.status(400).json({
          error: `You cannot deposit more than ${maxDeposit} at this time.`,
        });
      }

      let profile = await Profile.findOne({
        where: { id: userId },
        transaction: t,
      });
      profile.balance += amount;

      await profile.save({ transaction: t });
      await t.commit();

      res.status(200).json({
        message: `Successfully deposited ${amount} into client ${profile.id}'s balance.`,
        profile,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "An error occurred while updating the profile's balance.",
      });
    }
  }
);

//1. **_GET_** `/admin/best-profession?start=<date>&end=<date>` - Returns the profession that earned the most money (sum of jobs paid) for any contactor that worked in the query time range.
//I just add a new type of user to access "admin" endpoints
app.get("/admin/best-profession", getProfile, async (req, res) => {
  if (req.profile.type !== "admin") {
    return res.status(403).json({
      error: "Forbidden: You don't have access to this feature.",
    });
  }

  try {
    const { start, end } = req.query;
    const bestProfession = await sequelize.query(
      `SELECT p.profession, SUM(j.price) total
       FROM jobs j
       INNER JOIN Contracts c ON j.ContractId = c.id
       INNER JOIN Profiles p ON c.ContractorId = p.id
       WHERE j.paid = 1 AND j.paymentDate BETWEEN :start AND :end
       GROUP BY p.profession
       ORDER BY total DESC
       LIMIT 1`,
      {
        type: QueryTypes.SELECT,
        replacements: { start: `${start} 00:00:00`, end: `${end} 23:59:59` },
      }
    );
    res.json(bestProfession[0] || {});
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// returns the clients the paid the most for jobs in the query time period. limit query parameter should be applied, default limit is 2.
app.get("/admin/best-clients", getProfile, async (req, res) => {
  if (req.profile.type !== "admin") {
    return res.status(403).json({
      error: "Forbidden: You don't have access to this feature.",
    });
  }
  try {
    const { start, end, limit } = req.query;
    const bestClients = await sequelize.query(
      `select p.id, (p.firstName || ' ' ||   p.lastName) as fullName, sum(j.price) as paid from Contracts c, Jobs j , Profiles p
      where p.id = c.ClientId
      and p.type = 'client'
      AND j.paid = 1 AND j.paymentDate BETWEEN :start AND :end
      GROUP BY p.id
      ORDER BY paid DESC LIMIT ${limit || "2"}`,
      {
        type: QueryTypes.SELECT,
        replacements: { start: `${start} 00:00:00`, end: `${end} 23:59:59` },
      }
    );
    res.json(bestClients || {});
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = app;
