---
title: "[LeetCode] 237. Delete Node in a Linked List"
date: "2019-07-25"
description: "Delete Node in a Linked List Link to original Problem on LeetCode Write a function to delete a node (except the tail) in a singly linked list, given only access to that node. Given linked list – head = [4,5,1,9], which looks like following: Example 1: Input: head = [4,5,1,9], node = 5 Output: [4,1,9] Explanation: You are given the second node with value 5, the linked list should become 4 -> 1 -> 9 after calling your function."
categories: ["Programming", "Algorithms", "LeetCode"]
tags: ["Delete Node in a Linked List", "Linked List", "LeetCode", "Algorithm"]
draft: false
---

### Delete Node in a Linked List

[Link to original Problem on LeetCode](https://leetcode.com/problems/delete-node-in-a-linked-list/)

Write a function to delete a node (except the tail) in a singly linked list, given only access to that node.

Given linked list – head = \[4,5,1,9\], which looks like following:

![Example](https://assets.leetcode.com/uploads/2018/12/28/237_example.png)

**Example 1:**

**Input:** head = \[4,5,1,9\], node = 5

**Output:** \[4,1,9\]

**Explanation:** You are given the second node with value 5, the linked list should become 4 -> 1 -> 9 after calling your function.

**Example 2:**

**Input:** head = \[4,5,1,9\], node = 1

**Output:** \[4,5,9\]

**Explanation:** You are given the third node with value 1, the linked list should become 4 -> 5 -> 9 after calling your function.

**Note:**

-   The linked list will have at least two elements.
-   All of the nodes’ values will be unique.
-   The given node will not be the tail and it will always be a valid node of the linked list.
-   Do not return anything from your function.

**Company:** *Amazon*, *Goldman Sachs*, *Microsoft*, *Samsung*, *Visa*

**Solution:**

**Time Complexity:** O(1) **Space Complexity:** O(1)

```python
class Solution(object):
    def deleteNode(self, node):
        """
        :type node: ListNode
        :rtype: void Do not return anything, modify node in-place instead.
        """
        # You have been given the reference to the node which is to be deleted
        # The simple way to delete is to:
        # -> change the value of the current node with the value of next node
        # -> again the reference to the next attribute is to be changed with the reference of next to next node
        node.val, node.next = node.next.val, node.next.next
```
