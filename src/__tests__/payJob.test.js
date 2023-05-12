const request = require("supertest");
const app = require("../app");
const { sequelize } = require("../model");
const { Job, Profile } = sequelize.models;

//Tests - Pay for a Job
describe("POST /jobs/:job_id/pay", () => {
  test("should pay for a job successfully", async () => {
    const { Job, Profile, Contract } = app.get("models");
    const contractor = await Profile.create({
      firstName: "John",
      lastName: "Doe",
      profession: "Software Developer",
      balance: 0,
      type: "contractor",
    });
    const client = await Profile.create({
      firstName: "Jane",
      lastName: "Doe",
      profession: "Project Manager",
      balance: 100,
      type: "client",
    });
    const contract = await Contract.create({
      ContractorId: contractor.id,
      ClientId: client.id,
      terms: "Some terms",
      status: "new",
    });
    const job = await Job.create({
      description: "Some job",
      price: 50,
      paid: false,
      paymentDate: null,
      ContractId: contract.id,
    });

    // Perform the payment
    const res = await request(app)
      .post(`/jobs/${job.id}/pay`)
      .set("profile_id", `${client.id}`)
      .expect(200);

    // Check that the job is marked as paid, and the balances are updated
    expect(res.body.id).toBe(job.id);
    expect(res.body.paid).toBe(true);
    expect(res.body.paymentDate).not.toBeNull();
    const updatedContractor = await Profile.findByPk(contractor.id);
    expect(updatedContractor.balance).toBe(50);
    const updatedClient = await Profile.findByPk(client.id);
    expect(updatedClient.balance).toBe(50);
  });

  test("should return 404 when the job is not found", async () => {
    const { Profile } = app.get("models");
    const client = await Profile.create({
      firstName: "Jane",
      lastName: "Doe",
      profession: "Project Manager",
      balance: 100,
      type: "client",
    });

    const res = await request(app)
      .post("/jobs/999/pay")
      .set("profile_id", `${client.id}`)
      .expect(404);

    expect(res.body.error).toBe("Job not found");
  });

  test("should not pay for a job with insufficient balance", async () => {
    const { Job, Profile, Contract } = app.get("models");
    const contractor = await Profile.create({
      firstName: "John",
      lastName: "Doe",
      profession: "Software Developer",
      balance: 0,
      type: "contractor",
    });
    const client = await Profile.create({
      firstName: "Jane",
      lastName: "Doe",
      profession: "Project Manager",
      balance: 100,
      type: "client",
    });
    const contract = await Contract.create({
      ContractorId: contractor.id,
      ClientId: client.id,
      terms: "Some terms",
      status: "new",
    });
    const job = await Job.create({
      description: "Some job",
      price: 5000,
      paid: false,
      paymentDate: null,
      ContractId: contract.id,
    });

    // Perform the payment
    const res = await request(app)
      .post(`/jobs/${job.id}/pay`)
      .set("profile_id", `${client.id}`)
      .expect(400);
  });

  // Define test case for unauthorized client
  test("should not pay for a job with insufficient balance", async () => {
    const { Job, Profile, Contract } = app.get("models");
    const contractor = await Profile.create({
      firstName: "John",
      lastName: "Doe",
      profession: "Software Developer",
      balance: 0,
      type: "contractor",
    });
    const client = await Profile.create({
      firstName: "Jane",
      lastName: "Doe",
      profession: "Project Manager",
      balance: 100,
      type: "client",
    });
    const contract = await Contract.create({
      ContractorId: contractor.id,
      ClientId: client.id,
      terms: "Some terms",
      status: "new",
    });
    const job = await Job.create({
      description: "Some job",
      price: 5000,
      paid: false,
      paymentDate: null,
      ContractId: contract.id,
    });

    // Perform the payment
    const res = await request(app)
      .post(`/jobs/${job.id}/pay`)
      .set("profile_id", `999`)
      .expect(401);
  });
});
