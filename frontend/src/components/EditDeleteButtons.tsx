import { EditIcon } from "@chakra-ui/icons";
import { IconButton, Link } from "@chakra-ui/react";
import NextLink from "next/link";
import React from "react";
import { DeleteButton } from "./DeleteButton";

export const EditDeleteButtons = ({ id }: { id: number }) => {
  return (
    <>
      <DeleteButton id={id} />
      <NextLink href="/post/edit/[id]" as={`/post/edit/${id}`}>
        <IconButton
          as={Link}
          icon={<EditIcon />}
          aria-label="Edit Post"
          size="sm"
        />
      </NextLink>
    </>
  );
};
