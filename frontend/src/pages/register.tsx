import { Button, Container } from "@chakra-ui/react";
import { Form, Formik } from "formik";
import { useRouter } from "next/dist/client/router";
import React from "react";
import { InputField } from "../components/InputField";
import NavBar from "../components/NavBar";
import { MeDocument, MeQuery, useRegisterMutation } from "../generated/graphql";
import withApollo from "../utils/apolloServer";
import { toErrorMap } from "../utils/toErrorMap";

const Register = () => {
  const [register] = useRegisterMutation();
  const router = useRouter();
  return (
    <>
      <NavBar />
      <Container mt={20} maxW="400">
        <Formik
          initialValues={{ email: "", username: "", password: "" }}
          onSubmit={async (values, actions) => {
            const response = await register({
              variables: { options: values },
              update: (cache, { data }) => {
                cache.writeQuery<MeQuery>({
                  query: MeDocument,
                  data: {
                    // the data to cache
                    __typename: "Query",
                    me: data?.register.user,
                  },
                });
              },
            });
            const errors = response.data?.register.errors;
            if (errors) return actions.setErrors(toErrorMap(errors)); // display error message to user.
            router.push("/");
          }}
        >
          {(props) => (
            <Form>
              <InputField
                name="email"
                placeholder="email"
                label="Email"
                type="email"
              />
              <InputField
                name="username"
                placeholder="username"
                label="Username"
              />
              <InputField
                name="password"
                placeholder="password"
                label="Password"
                type="password"
              />
              <Button
                mt={5}
                colorScheme="teal"
                isLoading={props.isSubmitting}
                type="submit"
              >
                Submit
              </Button>
            </Form>
          )}
        </Formik>
      </Container>
    </>
  );
};

export default withApollo({ ssr: false })(Register);
